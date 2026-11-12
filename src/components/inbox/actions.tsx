"use client";

import { addDays, addHours, format, nextMonday, nextSaturday, setHours, setMinutes, startOfHour } from "date-fns";
import { AlarmClock, CalendarClock, Clock, Coffee, Sun } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Conversation } from "@/lib/types";
import { useWorkspace } from "@/store/workspace";
import { useNow } from "@/store/selectors";
import { Button } from "../ui/button";
import { Input } from "../ui/controls";
import { MenuItem, MenuSeparator } from "../ui/menu";

export function snoozePresets(now = new Date()) {
  const at9 = (d: Date) => setMinutes(setHours(d, 9), 0);
  const laterToday = startOfHour(addHours(now, 3));
  return [
    { id: "later", label: "Later today", detail: format(laterToday, "h:mm a"), at: laterToday, icon: Clock, show: now.getHours() < 20 },
    { id: "tomorrow", label: "Tomorrow", detail: format(at9(addDays(now, 1)), "EEE h:mm a"), at: at9(addDays(now, 1)), icon: Sun, show: true },
    { id: "weekend", label: "This weekend", detail: format(at9(nextSaturday(now)), "EEE h:mm a"), at: at9(nextSaturday(now)), icon: Coffee, show: now.getDay() < 5 && now.getDay() > 0 },
    { id: "nextweek", label: "Next week", detail: format(at9(nextMonday(now)), "EEE, MMM d"), at: at9(nextMonday(now)), icon: CalendarClock, show: true },
  ].filter((p) => p.show);
}

/** Workspace actions with toasts + undo, shared by list rows, header and shortcuts. */
export function useConversationActions() {
  const ws = useWorkspace.getState;
  return {
    archive(c: Pick<Conversation, "id" | "title" | "archived">, opts?: { onDone?: () => void }) {
      const next = !c.archived;
      ws().setArchived([c.id], next);
      opts?.onDone?.();
      toast(next ? "Archived" : "Moved to inbox", {
        description: c.title,
        action: { label: "Undo", onClick: () => ws().setArchived([c.id], !next) },
      });
    },
    archiveMany(ids: string[], archived = true) {
      ws().setArchived(ids, archived);
      toast(`${ids.length} conversation${ids.length === 1 ? "" : "s"} ${archived ? "archived" : "moved to inbox"}`, {
        action: { label: "Undo", onClick: () => ws().setArchived(ids, !archived) },
      });
    },
    toggleStar(c: Pick<Conversation, "id" | "starred">) {
      ws().toggleStar(c.id);
    },
    toggleRead(c: Pick<Conversation, "id" | "unreadCount">) {
      if (c.unreadCount > 0) ws().markRead(c.id);
      else ws().markUnread(c.id);
    },
    togglePin(c: Pick<Conversation, "id" | "pinned">) {
      ws().togglePin(c.id);
      toast(c.pinned ? "Unpinned" : "Pinned to top");
    },
    snooze(c: Pick<Conversation, "id" | "title">, until: Date, label?: string, opts?: { onDone?: () => void }) {
      ws().snooze(c.id, until.toISOString());
      opts?.onDone?.();
      toast(`Snoozed until ${label ?? format(until, "EEE, MMM d · h:mm a")}`, {
        description: c.title,
        action: { label: "Undo", onClick: () => ws().unsnooze(c.id) },
      });
    },
    unsnooze(c: Pick<Conversation, "id">) {
      ws().unsnooze(c.id);
      toast("Snooze removed");
    },
  };
}

/** Snooze presets rendered as menu items (used inside a Menu). */
export function SnoozeMenuItems({ conversation, onDone, onCustom }: { conversation: Conversation; onDone?: () => void; onCustom: () => void }) {
  const actions = useConversationActions();
  const now = useNow();
  return (
    <>
      {snoozePresets(new Date(now)).map((p) => (
        <MenuItem key={p.id} onSelect={() => actions.snooze(conversation, p.at, `${p.label.toLowerCase()} (${p.detail})`, { onDone })}>
          <p.icon />
          <span>{p.label}</span>
          <span className="ml-auto pl-4 text-xs text-fg-3">{p.detail}</span>
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem onSelect={onCustom}>
        <AlarmClock /> Pick date & time…
      </MenuItem>
      {conversation.snoozedUntil ? (
        <MenuItem onSelect={() => actions.unsnooze(conversation)}>
          <Clock /> Remove snooze
        </MenuItem>
      ) : null}
    </>
  );
}

export function CustomDateTimeForm({
  submitLabel,
  onSubmit,
  onCancel,
  initial,
}: {
  submitLabel: string;
  onSubmit: (d: Date) => void;
  onCancel?: () => void;
  initial?: Date;
}) {
  const [value, setValue] = useState(() => format(initial ?? addDays(setMinutes(setHours(new Date(), 9), 0), 1), "yyyy-MM-dd'T'HH:mm"));
  const now = useNow();
  const parsed = new Date(value);
  const valid = !Number.isNaN(parsed.getTime()) && parsed.getTime() > now;
  return (
    <form
      className="w-64 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(parsed);
      }}
    >
      <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Date and time" autoFocus />
      {!valid ? <p className="text-xs text-danger">Pick a time in the future.</p> : <p className="text-xs text-fg-3">{format(parsed, "EEEE, MMMM d 'at' h:mm a")}</p>}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" size="sm" variant="primary" disabled={!valid}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
