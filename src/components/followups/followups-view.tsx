"use client";

import { addDays, format, isToday, setHours, setMinutes } from "date-fns";
import { AlarmClock, Check, Hourglass, ListChecks, MoreHorizontal, Plus, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { detectFollowUps, type FollowUpSuggestion } from "@/lib/intelligence/followups";
import { inboxHref } from "@/lib/routes";
import type { Reminder, ReminderKind } from "@/lib/types";
import { cn, formatDue, formatRelative } from "@/lib/utils";
import { isSnoozed, useNow } from "@/store/selectors";
import { useWorkspace } from "@/store/workspace";
import { PlatformIcon } from "../brand/platform-icon";
import { PageHeader } from "../shell/page-header";
import { Button, IconButton } from "../ui/button";
import { Badge, Input, Segmented } from "../ui/controls";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "../ui/dialog";
import { EmptyState } from "../ui/empty";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/menu";

type Tab = "today" | "upcoming" | "overdue" | "waiting" | "completed";

const KIND_LABEL: Record<ReminderKind, string> = { reminder: "Reminder", follow_up: "Follow-up", task: "Task", awaiting_response: "Awaiting reply" };

export function FollowUpsView() {
  const now = useNow();
  const reminders = useWorkspace((s) => s.reminders);
  const conversations = useWorkspace((s) => s.conversations);
  const messages = useWorkspace((s) => s.messages);
  const addReminder = useWorkspace((s) => s.addReminder);
  const [tab, setTab] = useState<Tab>("today");
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(false);

  const groups = useMemo(() => {
    const open = reminders.filter((r) => !r.completedAt);
    const endToday = new Date(now);
    endToday.setHours(23, 59, 59, 999);
    const due = (r: Reminder) => (r.dueAt ? new Date(r.dueAt).getTime() : Infinity);
    const byDue = (a: Reminder, b: Reminder) => due(a) - due(b);
    return {
      overdue: open.filter((r) => r.kind !== "awaiting_response" && due(r) < now).sort(byDue),
      today: open.filter((r) => r.kind !== "awaiting_response" && due(r) >= now && due(r) <= endToday.getTime()).sort(byDue),
      upcoming: open.filter((r) => r.kind !== "awaiting_response" && due(r) > endToday.getTime()).sort(byDue),
      waiting: open.filter((r) => r.kind === "awaiting_response").sort(byDue),
      completed: reminders.filter((r) => r.completedAt).sort((a, b) => b.completedAt!.localeCompare(a.completedAt!)),
    };
  }, [reminders, now]);

  const suggestions = useMemo(() => {
    const live = conversations.filter((c) => !c.archived && !isSnoozed(c, now));
    const tracked = new Set(reminders.filter((r) => !r.completedAt && r.conversationId).map((r) => r.conversationId));
    return detectFollowUps(live, messages, now).filter((s) => !tracked.has(s.conversationId) && !dismissed.includes(s.id));
  }, [conversations, messages, reminders, dismissed, now]);

  const acceptSuggestion = (s: FollowUpSuggestion) => {
    const conv = conversations.find((c) => c.id === s.conversationId);
    const defaultDue = setMinutes(setHours(addDays(new Date(now), 1), 9), 0);
    const dueAt = s.dueAt ? new Date(new Date(s.dueAt).getTime() - 3 * 3_600_000) : defaultDue;
    addReminder({
      kind: s.type === "awaiting_them" ? "awaiting_response" : "follow_up",
      title: s.title,
      conversationId: s.conversationId,
      contactId: conv?.contactId,
      dueAt: (dueAt.getTime() < now ? defaultDue : dueAt).toISOString(),
      note: s.reason,
      source: "suggestion",
    });
    toast("Added to follow-ups", { description: s.title });
  };

  const TABS: { value: Tab; label: string; count: number }[] = [
    { value: "today", label: "Due today", count: groups.today.length },
    { value: "upcoming", label: "Upcoming", count: groups.upcoming.length },
    { value: "overdue", label: "Overdue", count: groups.overdue.length },
    { value: "waiting", label: "Waiting", count: groups.waiting.length },
    { value: "completed", label: "Completed", count: groups.completed.length },
  ];
  const list = groups[tab];

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <PageHeader
        title="Follow-ups"
        description="Reminders, commitments and conversations waiting on someone"
        actions={
          <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>
            <Plus /> New
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-[820px] px-4 py-6 sm:px-8">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Overdue" value={groups.overdue.length} tone={groups.overdue.length ? "danger" : undefined} onClick={() => setTab("overdue")} />
            <Stat label="Due today" value={groups.today.length} onClick={() => setTab("today")} />
            <Stat label="Upcoming" value={groups.upcoming.length} onClick={() => setTab("upcoming")} />
            <Stat label="Waiting on others" value={groups.waiting.length} onClick={() => setTab("waiting")} />
          </div>

          {suggestions.length > 0 ? (
            <section className="mt-6 rounded-lg border border-line bg-surface shadow-xs">
              <div className="flex items-center gap-2 border-b border-line-subtle px-4 py-2.5">
                <Sparkles className="size-3.5 text-accent-text" />
                <h2 className="text-[0.8125rem] font-semibold">Suggested follow-ups</h2>
                <span className="text-xs text-fg-3">Detected from your conversations. Nothing is sent automatically.</span>
              </div>
              {suggestions.slice(0, 6).map((s) => {
                const conv = conversations.find((c) => c.id === s.conversationId);
                return (
                  <div key={s.id} className="flex items-start gap-3 border-b border-line-subtle px-4 py-3 last:border-b-0">
                    {conv ? <PlatformIcon platform={conv.platform} size={16} className="mt-0.5" /> : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={inboxHref({ c: s.conversationId })} className="truncate text-[0.8125rem] font-medium hover:underline">
                          {s.title}
                        </Link>
                        <Badge tone={s.type === "their_deadline" || s.type === "your_commitment" ? "warning" : s.type === "awaiting_them" ? "info" : "neutral"}>
                          {s.type === "needs_reply" ? "Needs your reply" : s.type === "awaiting_them" ? "Waiting on them" : s.type === "your_commitment" ? "Your commitment" : "Their deadline"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-fg-3">
                        {s.reason}
                        {s.dueAt ? ` · due ${formatDue(s.dueAt)}` : ` · ${formatRelative(s.since)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="xs" variant="secondary" onClick={() => acceptSuggestion(s)}>
                        <Plus /> Track
                      </Button>
                      <IconButton size="xs" label="Dismiss suggestion" onClick={() => setDismissed((d) => [...d, s.id])}>
                        <X />
                      </IconButton>
                    </div>
                  </div>
                );
              })}
            </section>
          ) : null}

          <div className="mt-6 overflow-x-auto scrollbar-none">
            <Segmented value={tab} onChange={setTab} ariaLabel="Follow-up groups" options={TABS.map((t) => ({ value: t.value, label: <span>{t.label} {t.count ? <span className="tabular ml-0.5 text-fg-4">{t.count}</span> : null}</span> }))} />
          </div>

          <div className="mt-3">
            {list.length === 0 ? (
              <EmptyState
                compact
                icon={tab === "waiting" ? <Hourglass /> : tab === "completed" ? <Check /> : <ListChecks />}
                title={{ today: "Nothing due today", upcoming: "Nothing upcoming", overdue: "Nothing overdue", waiting: "Not waiting on anyone", completed: "Nothing completed yet" }[tab]}
                description={tab === "waiting" ? "Mark a conversation as “Awaiting reply” (press M) to track who owes you a response." : "Press M in any conversation to set a reminder."}
              />
            ) : (
              <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
                {list.map((r) => (
                  <ReminderRow key={r.id} reminder={r} now={now} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <NewReminderDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

function Stat({ label, value, tone, onClick }: { label: string; value: number; tone?: "danger"; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-lg border border-line bg-surface px-4 py-3 text-left shadow-xs transition-colors hover:border-line-strong">
      <div className="text-xs text-fg-3">{label}</div>
      <div className={cn("tabular mt-1 text-[1.375rem] font-semibold tracking-[-0.02em]", tone === "danger" ? "text-danger" : "text-fg")}>{value}</div>
    </button>
  );
}

function ReminderRow({ reminder: r, now }: { reminder: Reminder; now: number }) {
  const conv = useWorkspace((s) => (r.conversationId ? s.conversations.find((c) => c.id === r.conversationId) : undefined));
  const account = useWorkspace((s) => (conv ? s.accounts.find((a) => a.id === conv.accountId) : undefined));
  const { completeReminder, updateReminder, deleteReminder } = useWorkspace.getState();
  const overdue = !r.completedAt && r.dueAt && new Date(r.dueAt).getTime() < now;
  const push = (days: number) => {
    const base = setMinutes(setHours(addDays(new Date(now), days), 9), 0);
    updateReminder(r.id, { dueAt: base.toISOString() });
    toast(`Moved to ${format(base, "EEE, MMM d")}`);
  };
  return (
    <div className="group flex items-start gap-3 border-b border-line-subtle px-4 py-3 last:border-b-0">
      <button
        onClick={() => {
          completeReminder(r.id, !r.completedAt);
          if (!r.completedAt) toast("Completed", { action: { label: "Undo", onClick: () => completeReminder(r.id, false) } });
        }}
        aria-label={r.completedAt ? "Mark as not done" : "Mark done"}
        className={cn(
          "mt-0.5 inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors",
          r.completedAt ? "border-success bg-success text-white" : "border-line-strong text-transparent hover:border-success hover:text-success",
        )}
      >
        <Check className="size-3" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-[0.8125rem] font-medium", r.completedAt && "text-fg-3 line-through")}>{r.title}</span>
          <Badge tone="outline">{KIND_LABEL[r.kind]}</Badge>
          {r.source === "suggestion" ? (
            <Badge tone="accent">
              <Sparkles /> Suggested
            </Badge>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-3">
          {r.dueAt ? (
            <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-danger")}>
              <AlarmClock className="size-3" />
              {overdue ? "Overdue · " : ""}
              {isToday(new Date(r.dueAt)) ? `Today ${format(new Date(r.dueAt), "h:mm a")}` : formatDue(r.dueAt)}
            </span>
          ) : null}
          {r.completedAt ? <span>Completed {formatRelative(r.completedAt)}</span> : null}
          {conv ? (
            <Link href={inboxHref({ c: conv.id })} className="inline-flex min-w-0 items-center gap-1 hover:text-fg">
              <PlatformIcon platform={conv.platform} size={12} />
              <span className="truncate">
                {conv.kind === "channel" ? `#${conv.title}` : conv.title} · {account?.label}
              </span>
            </Link>
          ) : null}
        </div>
        {r.note ? <p className="mt-1 text-xs text-fg-3">{r.note}</p> : null}
      </div>
      {!r.completedAt ? (
        <Menu>
          <MenuTrigger asChild>
            <IconButton size="xs" label="Reminder options">
              <MoreHorizontal />
            </IconButton>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={() => push(1)}>
              <AlarmClock /> Tomorrow morning
            </MenuItem>
            <MenuItem onSelect={() => push(3)}>
              <AlarmClock /> In 3 days
            </MenuItem>
            <MenuItem onSelect={() => push(7)}>
              <AlarmClock /> Next week
            </MenuItem>
            {r.kind !== "awaiting_response" ? (
              <MenuItem onSelect={() => updateReminder(r.id, { kind: "awaiting_response" })}>
                <Hourglass /> Mark as awaiting reply
              </MenuItem>
            ) : null}
            <MenuSeparator />
            <MenuItem danger onSelect={() => (deleteReminder(r.id), toast("Reminder deleted"))}>
              <Trash2 /> Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      ) : (
        <IconButton size="xs" label="Delete" onClick={() => deleteReminder(r.id)} className="opacity-0 group-hover:opacity-100">
          <Trash2 />
        </IconButton>
      )}
    </div>
  );
}

function NewReminderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const addReminder = useWorkspace((s) => s.addReminder);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ReminderKind>("task");
  const [due, setDue] = useState(() => format(setMinutes(setHours(addDays(new Date(), 1), 9), 0), "yyyy-MM-dd'T'HH:mm"));
  const valid = title.trim() && !Number.isNaN(new Date(due).getTime());
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New follow-up" size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            addReminder({ kind, title: title.trim(), dueAt: new Date(due).toISOString(), source: "user" });
            toast("Added", { description: title.trim() });
            setTitle("");
            onOpenChange(false);
          }}
        >
          <DialogBody className="space-y-3">
            <Segmented
              size="xs"
              value={kind}
              onChange={setKind}
              ariaLabel="Type"
              options={[
                { value: "task", label: "Task" },
                { value: "reminder", label: "Reminder" },
                { value: "follow_up", label: "Follow-up" },
                { value: "awaiting_response", label: "Awaiting" },
              ]}
            />
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What do you need to do?" aria-label="Title" autoFocus />
            <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due" />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!valid}>
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
