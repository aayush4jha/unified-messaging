"use client";

import { Archive, ArchiveRestore, BellOff, Clock, Mail, MailOpen, Paperclip, Pin, PinOff, Star, Zap } from "lucide-react";
import Link from "next/link";
import { memo, useState } from "react";
import { PLATFORMS } from "@/lib/platforms";
import type { Account, Conversation, Label } from "@/lib/types";
import { cn, formatListTime } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import { IconButton } from "../ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/controls";
import { Menu, MenuContent, MenuTrigger } from "../ui/menu";
import { Tooltip } from "../ui/tooltip";
import { CustomDateTimeForm, SnoozeMenuItems, useConversationActions } from "./actions";

export interface RowProps {
  conversation: Conversation;
  account?: Account;
  labels: Label[];
  href: string;
  selected: boolean;
  checked: boolean;
  focused: boolean;
  hasDraft: boolean;
  now: number;
  onToggleCheck: (id: string, range: boolean) => void;
  onAfterRemove?: (id: string) => void;
}

function displayName(c: Conversation): string {
  if (c.kind === "channel") return `#${c.title}`;
  if (c.kind === "email") {
    const others = c.participants.map((p) => p.name.split(" ")[0]);
    return c.participants.length > 1 ? others.join(", ") : (c.participants[0]?.name ?? c.title);
  }
  return c.title;
}

export const ConversationRow = memo(function ConversationRow({
  conversation: c,
  account,
  labels,
  href,
  selected,
  checked,
  focused,
  hasDraft,
  now,
  onToggleCheck,
  onAfterRemove,
}: RowProps) {
  const actions = useConversationActions();
  const [customSnooze, setCustomSnooze] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const unread = c.unreadCount > 0;
  const snoozed = c.snoozedUntil && new Date(c.snoozedUntil).getTime() > now;
  const rowLabels = labels.filter((l) => c.labels.includes(l.id));
  const lastFromMe = c.lastAuthorId === "me";
  const lastAuthor = c.participants.find((p) => p.id === c.lastAuthorId);
  const previewPrefix = lastFromMe ? "You: " : (c.kind === "group" || c.kind === "channel") && lastAuthor ? `${lastAuthor.name.split(" ")[0]}: ` : "";
  const platform = PLATFORMS[c.platform];

  return (
    <div
      role="option"
      aria-selected={selected}
      data-conversation-id={c.id}
      className={cn(
        "group/row relative border-b border-line-subtle transition-colors duration-100",
        selected ? "bg-selected" : checked ? "bg-accent-soft" : "hover:bg-hover",
        focused && !selected && "bg-hover",
      )}
    >
      {selected ? <span className="absolute inset-y-0 left-0 w-[2px] bg-accent" aria-hidden /> : null}
      <Link
        href={href}
        scroll={false}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey) {
            e.preventDefault();
            onToggleCheck(c.id, e.shiftKey);
          }
        }}
        className="flex gap-3 px-4 py-[var(--row-py)] outline-none focus-visible:bg-hover"
        aria-label={`${displayName(c)}, ${platform.name} ${account?.label ?? ""}, ${unread ? "unread, " : ""}${c.title}`}
      >
        <div className="relative pt-0.5" style={{ "--avatar-ring": selected ? "var(--selected)" : checked ? "var(--surface)" : "var(--surface)" } as React.CSSProperties}>
          <span className={cn("block transition-opacity duration-100", checked && "opacity-0")}>
            <Avatar name={c.kind === "channel" ? c.title : c.participants[0]?.name ?? c.title} hue={c.participants[0]?.avatarHue} group={c.kind === "channel"} platform={c.platform} />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          {/* Line 1 */}
          <div className="flex items-center gap-1.5">
            {unread ? <span className="size-[7px] shrink-0 rounded-full bg-accent" aria-hidden /> : null}
            <span className={cn("truncate text-[0.8125rem]", unread ? "font-semibold text-fg" : "font-medium text-fg-2")}>{displayName(c)}</span>
            {c.participants.length > 1 && c.kind !== "channel" && c.kind !== "email" ? <span className="shrink-0 text-xs text-fg-4">{c.participants.length + 1}</span> : null}
            <span className="shrink-0 truncate rounded-[4px] px-1 text-[0.6875rem] leading-4 text-fg-3 ring-1 ring-inset ring-line">{account?.label}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1 pl-2">
              {c.priority === "high" ? (
                <Tooltip label={<span className="block max-w-[240px]">Priority: {c.priorityReasons.filter((r) => !r.startsWith("Group")).slice(0, 3).join(" · ")}</span>}>
                  <Zap className="size-3.5 fill-current text-accent-text" aria-label="High priority" />
                </Tooltip>
              ) : null}
              <span className={cn("tabular text-[0.6875rem] group-hover/row:invisible", unread ? "font-medium text-fg-2" : "text-fg-3", (menuOpen || customSnooze) && "invisible")}>
                {snoozed ? <Clock className="mr-0.5 inline size-3 align-[-2px]" /> : null}
                {formatListTime(c.lastMessageAt, new Date(now))}
              </span>
            </span>
          </div>

          {/* Line 2: subject (email) */}
          {c.kind === "email" ? (
            <div className={cn("mt-0.5 truncate text-[0.8125rem]", unread ? "font-medium text-fg" : "text-fg-2")}>{c.title}</div>
          ) : null}

          {/* Line 3: preview */}
          <div className="mt-0.5 flex items-start gap-1.5">
            <p className={cn("min-w-0 flex-1 text-[0.8125rem] leading-5 text-fg-3", c.kind === "email" ? "line-clamp-1" : "line-clamp-2")}>
              {hasDraft ? <span className="font-medium text-danger">Draft · </span> : null}
              {previewPrefix ? <span className="text-fg-2">{previewPrefix}</span> : null}
              {c.preview}
            </p>
            <span className="mt-0.5 flex shrink-0 items-center gap-1 text-fg-4">
              {c.hasAttachments ? <Paperclip className="size-3.5" aria-label="Has attachments" /> : null}
              {c.muted ? <BellOff className="size-3.5" aria-label="Muted" /> : null}
              {c.pinned ? <Pin className="size-3.5" aria-label="Pinned" /> : null}
              {c.starred ? <Star className="size-3.5 fill-[var(--warning)] text-[var(--warning)]" aria-label="Starred" /> : null}
            </span>
          </div>

          {rowLabels.length > 0 || snoozed ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {snoozed ? (
                <span className="inline-flex h-[18px] items-center gap-1 rounded-[4px] bg-info-soft px-1.5 text-[0.6875rem] font-medium text-info">
                  <Clock className="size-3" /> Snoozed
                </span>
              ) : null}
              {rowLabels.map((l) => (
                <span key={l.id} className="inline-flex h-[18px] items-center gap-1 rounded-[4px] bg-hover px-1.5 text-[0.6875rem] font-medium text-fg-2">
                  <span className="size-1.5 rounded-full" style={{ background: `oklch(0.65 0.13 ${l.hue})` }} />
                  {l.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </Link>

      {/* Selection checkbox (sibling of the link: no nested interactive elements) */}
      <button
        type="button"
        onClick={(e) => onToggleCheck(c.id, e.shiftKey)}
        aria-label={checked ? `Deselect ${displayName(c)}` : `Select ${displayName(c)}`}
        aria-pressed={checked}
        className={cn(
          "absolute left-4 top-[calc(var(--row-py)+2px)] flex size-9 items-center justify-center rounded-full border-2 transition-opacity duration-100",
          checked ? "border-accent bg-accent text-accent-contrast opacity-100" : "border-line-strong bg-surface text-transparent opacity-0 hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="m4 8.5 2.5 2.5L12 5.5" />
        </svg>
      </button>

      {/* Hover quick actions */}
      <div
        className={cn(
          "absolute right-3 top-2 flex items-center gap-0.5 rounded-[7px] border border-line bg-surface-raised p-0.5 shadow-md transition-opacity duration-100",
          menuOpen || customSnooze ? "opacity-100" : "pointer-events-none opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100",
        )}
      >
        <IconButton size="xs" label={c.archived ? "Move to inbox" : "Archive"} shortcut="E" onClick={() => actions.archive(c, { onDone: () => onAfterRemove?.(c.id) })}>
          {c.archived ? <ArchiveRestore /> : <Archive />}
        </IconButton>
        <IconButton size="xs" label={unread ? "Mark as read" : "Mark as unread"} shortcut="U" onClick={() => actions.toggleRead(c)}>
          {unread ? <MailOpen /> : <Mail />}
        </IconButton>
        <IconButton size="xs" label={c.starred ? "Unstar" : "Star"} shortcut="S" onClick={() => actions.toggleStar(c)}>
          <Star className={cn(c.starred && "fill-[var(--warning)] text-[var(--warning)]")} />
        </IconButton>
        <Popover open={customSnooze} onOpenChange={setCustomSnooze}>
          <PopoverAnchor asChild>
            <span>
              <Menu open={menuOpen} onOpenChange={setMenuOpen}>
                <MenuTrigger asChild>
                  <IconButton size="xs" label="Snooze" shortcut="H">
                    <Clock />
                  </IconButton>
                </MenuTrigger>
                <MenuContent align="end" className="w-64">
                  <SnoozeMenuItems conversation={c} onDone={() => onAfterRemove?.(c.id)} onCustom={() => setTimeout(() => setCustomSnooze(true), 0)} />
                </MenuContent>
              </Menu>
            </span>
          </PopoverAnchor>
          <PopoverContent align="end">
            <p className="mb-2 text-xs font-medium text-fg-2">Snooze until</p>
            <CustomDateTimeForm
              submitLabel="Snooze"
              onCancel={() => setCustomSnooze(false)}
              onSubmit={(d) => {
                actions.snooze(c, d, undefined, { onDone: () => onAfterRemove?.(c.id) });
                setCustomSnooze(false);
              }}
            />
          </PopoverContent>
        </Popover>
        <IconButton size="xs" label={c.pinned ? "Unpin" : "Pin"} shortcut="P" onClick={() => actions.togglePin(c)}>
          {c.pinned ? <PinOff /> : <Pin />}
        </IconButton>
      </div>
    </div>
  );
});
