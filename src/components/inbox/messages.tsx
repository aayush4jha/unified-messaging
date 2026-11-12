"use client";

import { addDays, setHours, setMinutes } from "date-fns";
import { AlarmClock, AlertCircle, Check, CheckCheck, ChevronDown, Clock, Copy, Download, FileText, Image as ImageIcon, ListPlus, MessageSquare, MoreHorizontal, RotateCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import type { Account, Attachment, Contact, Conversation, Message, Participant } from "@/lib/types";
import { cn, formatBytes, formatDayDivider, formatMessageTime } from "@/lib/utils";
import { DEMO_USER } from "@/lib/demo/seed";
import { useWorkspace } from "@/store/workspace";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/menu";
import { Tooltip } from "../ui/tooltip";

/* ------------------------------------------------------------------ per-message actions */

/** Turn any message into a task or reminder, or copy it. */
export function MessageMenu({ conversation: c, message: m, className }: { conversation: Conversation; message: Message; className?: string }) {
  const router = useRouter();
  const addReminder = useWorkspace((s) => s.addReminder);
  if (m.status === "pending" || m.status === "failed") return null;
  const excerpt = m.body.replace(/\s+/g, " ").trim();
  const title = excerpt ? (excerpt.length > 90 ? `${excerpt.slice(0, 89).trimEnd()}…` : excerpt) : c.title;
  const tomorrow9 = () => setMinutes(setHours(addDays(new Date(), 1), 9), 0).toISOString();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          aria-label="Message actions"
          className={cn("inline-flex size-6 items-center justify-center rounded-[5px] text-fg-3 opacity-0 transition-opacity hover:bg-hover hover:text-fg focus-visible:opacity-100 group-hover/msg:opacity-100 data-[state=open]:opacity-100", className)}
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </MenuTrigger>
      <MenuContent align="end" className="w-56">
        <MenuItem
          onSelect={() => {
            addReminder({ kind: "task", title, conversationId: c.id, contactId: c.contactId, dueAt: tomorrow9(), note: excerpt.length > 90 ? excerpt.slice(0, 600) : undefined, source: "user" });
            toast("Task created from message", { description: title, action: { label: "View", onClick: () => router.push("/follow-ups?tab=upcoming") } });
          }}
        >
          <ListPlus /> Create task from message
        </MenuItem>
        <MenuItem
          onSelect={() => {
            addReminder({ kind: "reminder", title: `Revisit: ${title}`, conversationId: c.id, contactId: c.contactId, dueAt: tomorrow9(), source: "user" });
            toast("Reminder set for tomorrow, 9:00 AM");
          }}
        >
          <AlarmClock /> Remind me tomorrow
        </MenuItem>
        <MenuItem onSelect={() => void navigator.clipboard?.writeText(m.body).then(() => toast("Copied"))}>
          <Copy /> Copy text
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export interface ThreadProps {
  conversation: Conversation;
  messages: Message[];
  account?: Account;
  contacts: Map<string, Contact>;
}

function author(c: Conversation, m: Message): Participant & { isMe: boolean } {
  if (m.authorId === "me") return { id: "me", name: "You", handle: DEMO_USER.email, isMe: true };
  const p = c.participants.find((x) => x.id === m.authorId);
  return { ...(p ?? { id: m.authorId, name: m.authorId }), isMe: false };
}

/* ------------------------------------------------------------------ status */

export function DeliveryStatus({ message, platform }: { message: Message; platform: Conversation["platform"] }) {
  if (message.authorId !== "me") return null;
  switch (message.status) {
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 text-[0.6875rem] text-fg-3" aria-live="polite">
          <Clock className="size-3 animate-pulse-dot" /> Sending…
        </span>
      );
    case "failed":
      return null;
    case "sent":
      return (
        <Tooltip label="Sent">
          <Check className="size-3.5 text-fg-3" aria-label="Sent" />
        </Tooltip>
      );
    case "delivered":
      return (
        <Tooltip label="Delivered">
          <CheckCheck className="size-3.5 text-fg-3" aria-label="Delivered" />
        </Tooltip>
      );
    case "read":
      return platform === "whatsapp" || platform === "messenger" || platform === "instagram" ? (
        <Tooltip label="Read">
          <CheckCheck className="size-3.5 text-info" aria-label="Read" />
        </Tooltip>
      ) : (
        <Tooltip label="Sent">
          <Check className="size-3.5 text-fg-3" aria-label="Sent" />
        </Tooltip>
      );
  }
}

export function FailedNotice({ message, conversationId }: { message: Message; conversationId: string }) {
  const retry = useWorkspace((s) => s.retry);
  const discard = useWorkspace((s) => s.discardFailed);
  const [busy, setBusy] = useState(false);
  if (message.status !== "failed") return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-[6px] bg-danger-soft px-2.5 py-1.5 text-xs text-danger" role="alert">
      <AlertCircle className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 font-medium">Not sent. {message.error}</span>
      <Button
        size="xs"
        variant="secondary"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          const r = await retry(conversationId, message.id);
          setBusy(false);
          if (r?.ok) toast.success("Sent");
          else if (r) toast.error("Still couldn't send", { description: r.error });
        }}
      >
        {!busy ? <RotateCw /> : null} Retry
      </Button>
      <Button size="xs" variant="ghost" className="text-danger" onClick={() => discard(conversationId, message.id)}>
        <Trash2 /> Discard
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ attachments */

export function AttachmentCard({ a, compact }: { a: Attachment; compact?: boolean }) {
  const isImage = a.mimeType.startsWith("image/");
  const isPdf = a.mimeType === "application/pdf";
  return (
    <button
      type="button"
      onClick={() => {
        if (a.url) window.open(a.url, "_blank", "noopener");
        else toast("Preview unavailable", { description: "Sample attachments contain no file data. Real attachments open from the source account." });
      }}
      className={cn(
        "group/att inline-flex max-w-full items-center gap-2.5 rounded-md border border-line bg-surface text-left shadow-xs transition-colors hover:border-line-strong hover:bg-hover",
        compact ? "h-11 px-2.5" : "h-14 px-3",
      )}
    >
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-[6px]",
          compact ? "size-7" : "size-9",
          isPdf ? "bg-danger-soft text-danger" : isImage ? "bg-info-soft text-info" : "bg-hover text-fg-2",
        )}
      >
        {isImage ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}
      </span>
      <span className="min-w-0">
        <span className="block max-w-[220px] truncate text-[0.8125rem] font-medium text-fg">{a.name}</span>
        <span className="block text-[0.6875rem] text-fg-3">
          {isPdf ? "PDF" : isImage ? "Image" : a.name.split(".").pop()?.toUpperCase()} · {formatBytes(a.size)}
        </span>
      </span>
      <Download className="ml-1 size-3.5 shrink-0 text-fg-4 opacity-0 transition-opacity group-hover/att:opacity-100" />
    </button>
  );
}

/* ------------------------------------------------------------------ email */

export function EmailThread({ conversation: c, messages }: ThreadProps) {
  const lastIdx = messages.length - 1;
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (messages[lastIdx]) s.add(messages[lastIdx].id);
    messages.forEach((m) => (m.status === "failed" || m.status === "pending") && s.add(m.id));
    return s;
  });
  const [showAll, setShowAll] = useState(messages.length <= 4);
  const visible = showAll ? messages : [messages[0], ...messages.slice(-2)];
  const hiddenCount = messages.length - visible.length;

  return (
    <div className="mx-auto w-full max-w-[780px] px-4 pb-6 pt-5 sm:px-8">
      <h2 className="text-[1.25rem] font-semibold leading-7 tracking-[-0.02em] text-fg text-balance">{c.title}</h2>
      <p className="mt-1 text-xs text-fg-3">
        {messages.length} message{messages.length === 1 ? "" : "s"} · {c.participants.map((p) => p.name).join(", ")}
      </p>
      <div className="mt-5 overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
        {visible.map((m, i) => {
          const isOpen = expanded.has(m.id) || m.id === messages[lastIdx]?.id;
          const a = author(c, m);
          return (
            <Fragment key={m.id}>
              {!showAll && i === 1 && hiddenCount > 0 ? (
                <button
                  onClick={() => setShowAll(true)}
                  className="flex w-full items-center gap-3 border-b border-line-subtle bg-surface-sunken/70 px-5 py-2 text-xs font-medium text-fg-2 hover:bg-hover"
                >
                  <span className="inline-flex size-6 items-center justify-center rounded-full border border-line bg-surface text-[0.6875rem] text-fg-2">{hiddenCount}</span>
                  more message{hiddenCount === 1 ? "" : "s"}
                </button>
              ) : null}
              <article className={cn("group/msg relative border-b border-line-subtle last:border-b-0", !isOpen && "hover:bg-hover")}>
                {isOpen ? <MessageMenu conversation={c} message={m} className="absolute right-3 top-3" /> : null}
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-5 pb-2 pt-4 text-left"
                  onClick={() =>
                    setExpanded((s) => {
                      const n = new Set(s);
                      if (n.has(m.id)) n.delete(m.id);
                      else n.add(m.id);
                      return n;
                    })
                  }
                  aria-expanded={isOpen}
                >
                  <Avatar name={a.isMe ? DEMO_USER.name : a.name} hue={a.avatarHue} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-[0.8125rem] font-semibold text-fg">{a.name}</span>
                      {isOpen && a.handle ? <span className="hidden truncate text-xs text-fg-3 sm:inline">&lt;{a.handle}&gt;</span> : null}
                      <span className={cn("ml-auto flex shrink-0 items-center gap-1.5 text-[0.6875rem] text-fg-3", isOpen && "pr-7")}>
                        {m.attachments.length > 0 && !isOpen ? <span className="text-fg-4">📎</span> : null}
                        <DeliveryStatus message={m} platform={c.platform} />
                        {m.status !== "pending" ? formatMessageTime(m.sentAt) : null}
                      </span>
                    </div>
                    {isOpen ? (
                      <div className="mt-0.5 truncate text-xs text-fg-3">
                        to {(m.to ?? []).join(", ") || "you"}
                        {m.cc?.length ? ` · cc ${m.cc.join(", ")}` : ""}
                      </div>
                    ) : (
                      <p className="mt-0.5 line-clamp-1 text-[0.8125rem] text-fg-3">{m.body.replace(/\s+/g, " ")}</p>
                    )}
                  </div>
                </button>
                {isOpen ? (
                  <div className="px-5 pb-5 pl-[3.75rem] animate-fade-in">
                    <div className="whitespace-pre-wrap break-words text-[0.875rem] leading-[1.6] text-fg">{m.body}</div>
                    {m.attachments.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {m.attachments.map((att) => (
                          <AttachmentCard key={att.id} a={att} />
                        ))}
                      </div>
                    ) : null}
                    <FailedNotice message={m} conversationId={c.id} />
                  </div>
                ) : null}
              </article>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ chat bubbles (WhatsApp, Telegram, Instagram, Messenger) */

export function ChatThread({ conversation: c, messages }: ThreadProps) {
  const isGroup = c.kind === "group";
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col px-4 pb-4 pt-6 sm:px-8">
      {messages.map((m, i) => {
        const a = author(c, m);
        const day = formatDayDivider(m.sentAt);
        const prev = messages[i - 1];
        const showDay = !prev || formatDayDivider(prev.sentAt) !== day;
        const next = messages[i + 1];
        const grouped = !showDay && prev && prev.authorId === m.authorId && new Date(m.sentAt).getTime() - new Date(prev.sentAt).getTime() < 5 * 60_000;
        const lastInGroup = !next || next.authorId !== m.authorId || formatDayDivider(next.sentAt) !== day;
        return (
          <Fragment key={m.id}>
            {showDay ? (
              <div className="sticky top-2 z-[1] my-4 flex justify-center">
                <span className="rounded-full border border-line bg-surface-raised/95 px-2.5 py-0.5 text-[0.6875rem] font-medium text-fg-3 shadow-xs backdrop-blur">{day}</span>
              </div>
            ) : null}
            <div className={cn("group/msg flex items-end gap-2", a.isMe ? "justify-end" : "justify-start", grouped ? "mt-0.5" : "mt-3")}>
              {a.isMe ? <MessageMenu conversation={c} message={m} className="mb-1" /> : null}
              {!a.isMe && isGroup ? <span className="w-7 shrink-0">{lastInGroup ? <Avatar name={a.name} hue={a.avatarHue} size="sm" /> : null}</span> : null}
              <div className={cn("flex max-w-[min(78%,520px)] flex-col", a.isMe ? "items-end" : "items-start")}>
                {!a.isMe && isGroup && !grouped ? <span className="mb-1 ml-3 text-[0.6875rem] font-medium" style={{ color: `oklch(0.55 0.12 ${a.avatarHue ?? 200})` }}>{a.name}</span> : null}
                <div
                  className={cn(
                    "relative px-3 py-[7px] text-[0.875rem] leading-[1.45] shadow-xs",
                    a.isMe ? "bg-accent text-accent-contrast" : "bg-bubble-in text-fg",
                    "rounded-[18px]",
                    a.isMe ? (lastInGroup ? "rounded-br-[6px]" : "") : lastInGroup ? "rounded-bl-[6px]" : "",
                    m.status === "pending" && "opacity-70",
                    m.status === "failed" && "ring-2 ring-danger/60",
                  )}
                >
                  {m.attachments.length > 0 ? (
                    <div className="mb-1.5 flex flex-col gap-1.5">
                      {m.attachments.map((att) => (
                        <AttachmentCard key={att.id} a={att} compact />
                      ))}
                    </div>
                  ) : null}
                  {m.body && m.body !== "📷 Photo" ? <span className="whitespace-pre-wrap break-words">{m.body}</span> : null}
                  <span className={cn("ml-2 inline-flex translate-y-[3px] items-center gap-0.5 whitespace-nowrap text-[0.625rem] float-right", a.isMe ? "text-accent-contrast [&_svg]:!text-current" : "text-fg-3")}>
                    {new Date(m.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    {a.isMe && m.status !== "pending" && m.status !== "failed" ? <DeliveryStatus message={m} platform={c.platform} /> : null}
                  </span>
                </div>
                {m.status === "pending" ? (
                  <span className="mt-1">
                    <DeliveryStatus message={m} platform={c.platform} />
                  </span>
                ) : null}
                <FailedNotice message={m} conversationId={c.id} />
              </div>
              {!a.isMe ? <MessageMenu conversation={c} message={m} className="mb-1" /> : null}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ Slack */

function renderSlackText(text: string) {
  return text.split(/(@[a-z][\w.-]*|#[a-z][\w-]*)/gi).map((part, i) =>
    /^[@#]/.test(part) ? (
      <span key={i} className={cn("rounded-[4px] px-0.5 font-medium", /^@alex\b/i.test(part) ? "bg-warning-soft text-fg" : "bg-info-soft text-info")}>
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function SlackThread({ conversation: c, messages }: ThreadProps) {
  return (
    <div className="flex w-full flex-col pb-4 pt-3">
      {messages.map((m, i) => {
        const a = author(c, m);
        const prev = messages[i - 1];
        const day = formatDayDivider(m.sentAt);
        const showDay = !prev || formatDayDivider(prev.sentAt) !== day;
        const grouped = !showDay && prev && prev.authorId === m.authorId && new Date(m.sentAt).getTime() - new Date(prev.sentAt).getTime() < 5 * 60_000;
        return (
          <Fragment key={m.id}>
            {showDay ? (
              <div className="relative my-3 flex items-center px-5">
                <div className="h-px flex-1 bg-line" />
                <span className="mx-3 rounded-full border border-line px-2.5 py-0.5 text-[0.6875rem] font-medium text-fg-2">{day}</span>
                <div className="h-px flex-1 bg-line" />
              </div>
            ) : null}
            <div className={cn("group/msg relative flex gap-3 px-5 py-1 hover:bg-hover/60", !grouped && "mt-1.5 pt-2")}>
              <MessageMenu conversation={c} message={m} className="absolute right-4 top-1" />
              <span className="w-9 shrink-0">
                {!grouped ? (
                  <Avatar name={a.isMe ? DEMO_USER.name : a.name} hue={a.avatarHue} size="md" className="[&_[data-avatar]]:rounded-[8px]" />
                ) : (
                  <span className="invisible block pt-1 text-right text-[0.625rem] text-fg-4 group-hover/msg:visible">
                    {new Date(m.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                {!grouped ? (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[0.8125rem] font-semibold text-fg">{a.isMe ? DEMO_USER.name : a.name}</span>
                    <span className="text-[0.6875rem] text-fg-3">{new Date(m.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                    <DeliveryStatus message={m} platform={c.platform} />
                  </div>
                ) : null}
                <div className={cn("whitespace-pre-wrap break-words text-[0.875rem] leading-[1.5] text-fg", m.status === "pending" && "text-fg-3")}>{renderSlackText(m.body)}</div>
                {m.attachments.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.attachments.map((att) => (
                      <AttachmentCard key={att.id} a={att} compact />
                    ))}
                  </div>
                ) : null}
                {m.reactions?.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {m.reactions.map((r) => (
                      <span
                        key={r.emoji}
                        title={r.mine ? "You reacted" : undefined}
                        className={cn(
                          "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors",
                          r.mine ? "border-accent/40 bg-accent-soft text-accent-text" : "border-line bg-surface text-fg-2",
                        )}
                        aria-label={`${r.emoji} ${r.count}`}
                      >
                        <span>{r.emoji}</span>
                        <span className="tabular font-medium">{r.count}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
                {m.threadReplyCount ? (
                  <div className="mt-1.5 inline-flex items-center gap-2 rounded-[6px] py-0.5 pr-2 text-xs">
                    <span className="flex -space-x-1.5">
                      {(m.threadParticipants ?? []).slice(0, 3).map((pid) => {
                        const p = pid === "me" ? { name: DEMO_USER.name, avatarHue: undefined } : c.participants.find((x) => x.id === pid);
                        return p ? <Avatar key={pid} name={p.name} hue={p.avatarHue} size="xs" className="ring-2 ring-surface rounded-full" /> : null;
                      })}
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-info">
                      <MessageSquare className="size-3" /> {m.threadReplyCount} replies in thread
                    </span>
                  </div>
                ) : null}
                <FailedNotice message={m} conversationId={c.id} />
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ LinkedIn */

export function ProfessionalThread({ conversation: c, messages, contacts }: ThreadProps) {
  const contact = c.contactId ? contacts.get(c.contactId) : undefined;
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-6 pt-6 sm:px-8">
      {contact ? (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-line bg-surface p-4 shadow-xs">
          <Avatar name={contact.name} hue={contact.avatarHue} size="lg" />
          <div className="min-w-0">
            <div className="text-[0.9375rem] font-semibold">{contact.name}</div>
            <div className="text-[0.8125rem] text-fg-2">
              {contact.title}
              {contact.company ? ` at ${contact.company}` : ""}
            </div>
          </div>
        </div>
      ) : null}
      <div className="space-y-5">
        {messages.map((m, i) => {
          const a = author(c, m);
          const day = formatDayDivider(m.sentAt);
          const showDay = i === 0 || formatDayDivider(messages[i - 1].sentAt) !== day;
          return (
            <Fragment key={m.id}>
              {showDay ? <div className="text-center text-[0.6875rem] font-medium uppercase tracking-[0.06em] text-fg-4">{day}</div> : null}
              <div className="group/msg relative flex gap-3">
                <MessageMenu conversation={c} message={m} className="absolute -right-1 top-0" />
                <Avatar name={a.isMe ? DEMO_USER.name : a.name} hue={a.avatarHue} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[0.8125rem] font-semibold">{a.isMe ? DEMO_USER.name : a.name}</span>
                    <span className="text-[0.6875rem] text-fg-3">{new Date(m.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[0.875rem] leading-[1.6] text-fg">{m.body}</p>
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export function JumpToLatest({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute bottom-4 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-surface-raised px-3 py-1 text-xs font-medium text-fg-2 shadow-md animate-slide-up hover:text-fg"
    >
      <ChevronDown className="size-3.5" /> Jump to latest
    </button>
  );
}
