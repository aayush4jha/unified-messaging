"use client";

import { addDays, addHours, format, nextMonday, setHours, setMinutes } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import type { Conversation, ReminderKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/store/workspace";
import { Button } from "../ui/button";
import { Input, Popover, PopoverContent, PopoverTrigger, Segmented } from "../ui/controls";

const KINDS: { value: ReminderKind; label: string }[] = [
  { value: "reminder", label: "Remind me" },
  { value: "follow_up", label: "Follow up" },
  { value: "awaiting_response", label: "Awaiting reply" },
  { value: "task", label: "Task" },
];

export function ReminderPopover({
  conversation,
  children,
  open,
  onOpenChange,
  defaultTitle,
  defaultDue,
}: {
  conversation: Conversation;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  defaultTitle?: string;
  defaultDue?: Date;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-0">
        {isOpen ? <ReminderForm conversation={conversation} onDone={() => setOpen(false)} defaultTitle={defaultTitle} defaultDue={defaultDue} /> : null}
      </PopoverContent>
    </Popover>
  );
}

export function ReminderForm({ conversation, onDone, defaultTitle, defaultDue }: { conversation: Conversation; onDone: () => void; defaultTitle?: string; defaultDue?: Date }) {
  const addReminder = useWorkspace((s) => s.addReminder);
  const name = conversation.participants[0]?.name.split(" ")[0] ?? conversation.title;
  const [kind, setKind] = useState<ReminderKind>("follow_up");
  const [title, setTitle] = useState(defaultTitle ?? `Follow up with ${name}`);
  const presets = [
    { id: "3h", label: "In 3 hours", at: addHours(new Date(), 3) },
    { id: "tomorrow", label: "Tomorrow", at: setMinutes(setHours(addDays(new Date(), 1), 9), 0) },
    { id: "3d", label: "In 3 days", at: setMinutes(setHours(addDays(new Date(), 3), 9), 0) },
    { id: "monday", label: "Next Monday", at: setMinutes(setHours(nextMonday(new Date()), 9), 0) },
  ];
  const [due, setDue] = useState<Date>(defaultDue ?? presets[1].at);
  const [custom, setCustom] = useState(format(due, "yyyy-MM-dd'T'HH:mm"));

  const changeKind = (k: ReminderKind) => {
    setKind(k);
    if (!defaultTitle) {
      setTitle(
        k === "follow_up" ? `Follow up with ${name}` : k === "awaiting_response" ? `Waiting on ${name}` : k === "task" ? `To-do from ${name}` : `Revisit: ${conversation.title}`,
      );
    }
  };

  return (
    <form
      className="p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        addReminder({ kind, title: title.trim(), conversationId: conversation.id, contactId: conversation.contactId, dueAt: due.toISOString(), source: "user" });
        toast("Reminder set", { description: `${title.trim()} · ${format(due, "EEE, MMM d 'at' h:mm a")}` });
        onDone();
      }}
    >
      <p className="mb-2 text-xs font-medium text-fg-2">Create a reminder</p>
      <Segmented value={kind} onChange={changeKind} options={KINDS} size="xs" className="mb-3 flex w-full [&>button]:flex-1" ariaLabel="Reminder type" />
      <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" autoFocus />
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setDue(p.at);
              setCustom(format(p.at, "yyyy-MM-dd'T'HH:mm"));
            }}
            className={cn(
              "rounded-[6px] border px-2 py-1.5 text-left text-xs transition-colors",
              Math.abs(due.getTime() - p.at.getTime()) < 60_000 ? "border-accent bg-accent-soft text-fg" : "border-line text-fg-2 hover:bg-hover",
            )}
          >
            <span className="block font-medium">{p.label}</span>
            <span className="block text-[0.6875rem] text-fg-3">{format(p.at, "EEE h:mm a")}</span>
          </button>
        ))}
      </div>
      <Input
        type="datetime-local"
        className="mt-2"
        value={custom}
        onChange={(e) => {
          setCustom(e.target.value);
          const d = new Date(e.target.value);
          if (!Number.isNaN(d.getTime())) setDue(d);
        }}
        aria-label="Custom date and time"
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" variant="primary" disabled={!title.trim()}>
          Save reminder
        </Button>
      </div>
    </form>
  );
}
