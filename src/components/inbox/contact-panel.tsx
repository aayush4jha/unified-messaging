"use client";

import { Check, Copy, Crown, ExternalLink, ListChecks, Plus, StickyNote, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PLATFORMS } from "@/lib/platforms";
import { inboxHref } from "@/lib/routes";
import type { Conversation } from "@/lib/types";
import { cn, formatDue, formatListTime, formatRelative } from "@/lib/utils";
import { useNow } from "@/store/selectors";
import { useWorkspace } from "@/store/workspace";
import { PlatformIcon } from "../brand/platform-icon";
import { Avatar } from "../ui/avatar";
import { IconButton } from "../ui/button";
import { Switch, Textarea } from "../ui/controls";
import { ReminderPopover } from "./reminder-popover";

export function ContactPanel({ conversation: c, className, onClose }: { conversation: Conversation; className?: string; onClose: () => void }) {
  const contact = useWorkspace((s) => (c.contactId ? s.contacts.find((x) => x.id === c.contactId) : undefined));
  const conversations = useWorkspace((s) => s.conversations);
  const accounts = useWorkspace((s) => s.accounts);
  const updateContact = useWorkspace((s) => s.updateContact);
  const info = PLATFORMS[c.platform];
  const account = accounts.find((a) => a.id === c.accountId);

  const linked = useMemo(() => {
    if (!contact) return [];
    const ids = new Set([contact.id, ...contact.mergedFrom.map((m) => m.id)]);
    return conversations
      .filter((x) => x.id !== c.id && (ids.has(x.contactId ?? "") || x.participants.some((p) => p.contactId && ids.has(p.contactId))))
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
      .slice(0, 6);
  }, [contact, conversations, c.id]);

  return (
    <aside aria-label="Details" className={cn("w-[300px] shrink-0 flex-col overflow-y-auto border-l border-line bg-surface scrollbar-thin", className)}>
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line-subtle px-4">
        <span className="text-xs font-medium uppercase tracking-[0.05em] text-fg-4">Details</span>
        <IconButton size="xs" label="Close details" onClick={onClose}>
          <X />
        </IconButton>
      </div>

      {/* Identity */}
      <div className="border-b border-line-subtle px-4 py-5">
        {contact ? (
          <>
            <div className="flex items-start gap-3">
              <Avatar name={contact.name} hue={contact.avatarHue} size="lg" />
              <div className="min-w-0 flex-1 pt-0.5">
                <Link href={`/contacts?id=${contact.id}`} className="block truncate text-[0.9375rem] font-semibold hover:underline">
                  {contact.name}
                </Link>
                {contact.title || contact.company ? (
                  <p className="mt-0.5 text-xs leading-4 text-fg-3">
                    {contact.title}
                    {contact.title && contact.company ? " · " : ""}
                    {contact.company}
                  </p>
                ) : null}
              </div>
            </div>
            <label className="mt-4 flex items-center gap-2 text-xs text-fg-2">
              <Crown className="size-3.5 text-fg-3" /> VIP: always high priority
              <Switch className="ml-auto" checked={contact.vip} onCheckedChange={(v) => updateContact(contact.id, { vip: v })} aria-label="VIP" />
            </label>
          </>
        ) : (
          <div className="flex items-start gap-3">
            <Avatar name={c.kind === "channel" ? c.title : c.title} group={c.kind === "channel"} size="lg" />
            <div className="min-w-0 pt-0.5">
              <div className="truncate text-[0.9375rem] font-semibold">{c.kind === "channel" ? `#${c.title}` : c.title}</div>
              <p className="mt-0.5 text-xs text-fg-3">{c.participants.length + 1} participants</p>
            </div>
          </div>
        )}
      </div>

      {/* Source */}
      <Section title="Conversation">
        <Row label="Platform">
          <span className="inline-flex items-center gap-1.5">
            <PlatformIcon platform={c.platform} size={14} /> {info.name}
          </span>
        </Row>
        <Row label="Account">
          <span className="truncate" title={account?.handle}>
            {account?.label}
          </span>
        </Row>
        <Row label="Messages">{c.messageCount}</Row>
        <Row label="Last activity">{formatRelative(c.lastMessageAt)}</Row>
        {c.kind !== "dm" && c.kind !== "email" ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {c.participants.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-hover py-0.5 pl-0.5 pr-2 text-[0.6875rem] text-fg-2">
                <Avatar name={p.name} hue={p.avatarHue} size="xs" /> {p.name}
              </span>
            ))}
          </div>
        ) : null}
      </Section>

      {/* Identities */}
      {contact && (contact.emails.length > 0 || contact.phones.length > 0 || contact.handles.length > 0) ? (
        <Section title="Reach them on">
          <div className="space-y-1">
            {contact.handles.map((h) => (
              <CopyRow key={`${h.platform}:${h.value}`} icon={<PlatformIcon platform={h.platform} size={14} label />} value={h.value} />
            ))}
            {contact.phones
              .filter((ph) => !contact.handles.some((h) => h.value === ph))
              .map((ph) => (
                <CopyRow key={ph} icon={<span className="w-3.5 text-center text-[0.6875rem] text-fg-3">☎</span>} value={ph} />
              ))}
          </div>
        </Section>
      ) : null}

      {/* Unified history */}
      {linked.length > 0 ? (
        <Section title={`Other conversations with ${contact?.name.split(" ")[0]}`}>
          <div className="-mx-2 space-y-px">
            {linked.map((x) => (
              <Link key={x.id} href={inboxHref({ c: x.id })} className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 hover:bg-hover">
                <PlatformIcon platform={x.platform} size={14} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-fg">{x.kind === "email" ? x.title : `${PLATFORMS[x.platform].name} · ${accounts.find((a) => a.id === x.accountId)?.label}`}</span>
                  <span className="block truncate text-[0.6875rem] text-fg-3">{x.preview}</span>
                </span>
                <span className="shrink-0 text-[0.6875rem] text-fg-4">{formatListTime(x.lastMessageAt)}</span>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      <RemindersSection conversation={c} />
      <NotesSection conversationId={c.id} />

      {c.externalUrl || info.alternative ? (
        <div className="px-4 pb-6 pt-1">
          <a
            href={c.externalUrl ?? info.alternative!.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-3 hover:text-fg"
          >
            Open in {info.shortName} <ExternalLink className="size-3" />
          </a>
        </div>
      ) : null}
    </aside>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-b border-line-subtle px-4 py-4">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-fg-4">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-xs">
      <span className="text-fg-3">{label}</span>
      <span className="min-w-0 truncate text-right text-fg-2">{children}</span>
    </div>
  );
}

function CopyRow({ icon, value }: { icon: React.ReactNode; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="group/copy -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-[6px] px-2 py-1 text-left text-xs text-fg-2 hover:bg-hover"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      aria-label={`Copy ${value}`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{value}</span>
      {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3 text-fg-4 opacity-0 group-hover/copy:opacity-100" />}
    </button>
  );
}

function RemindersSection({ conversation }: { conversation: Conversation }) {
  const allReminders = useWorkspace((s) => s.reminders);
  const reminders = useMemo(() => allReminders.filter((r) => r.conversationId === conversation.id), [allReminders, conversation.id]);
  const complete = useWorkspace((s) => s.completeReminder);
  const remove = useWorkspace((s) => s.deleteReminder);
  const open = reminders.filter((r) => !r.completedAt);
  const now = useNow();
  return (
    <Section
      title="Follow-ups"
      action={
        <ReminderPopover conversation={conversation}>
          <IconButton size="xs" label="Add reminder">
            <Plus />
          </IconButton>
        </ReminderPopover>
      }
    >
      {open.length === 0 ? (
        <p className="text-xs text-fg-4">No reminders. Press M to add one.</p>
      ) : (
        <ul className="space-y-1.5">
          {open.map((r) => {
            const overdue = r.dueAt && new Date(r.dueAt).getTime() < now;
            return (
              <li key={r.id} className="group/rem flex items-start gap-2">
                <button
                  aria-label="Mark done"
                  onClick={() => {
                    complete(r.id);
                    toast("Marked done", { action: { label: "Undo", onClick: () => complete(r.id, false) } });
                  }}
                  className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-line-strong text-transparent transition-colors hover:border-success hover:text-success"
                >
                  <Check className="size-2.5" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-4 text-fg">{r.title}</p>
                  {r.dueAt ? <p className={cn("text-[0.6875rem]", overdue ? "font-medium text-danger" : "text-fg-3")}>{overdue ? "Overdue · " : ""}{formatDue(r.dueAt)}</p> : null}
                </div>
                <button aria-label="Delete reminder" onClick={() => remove(r.id)} className="rounded-[4px] p-0.5 text-fg-4 opacity-0 hover:text-danger group-hover/rem:opacity-100">
                  <Trash2 className="size-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/follow-ups" className="mt-2.5 inline-flex items-center gap-1 text-[0.6875rem] font-medium text-fg-3 hover:text-fg">
        <ListChecks className="size-3" /> All follow-ups
      </Link>
    </Section>
  );
}

function NotesSection({ conversationId }: { conversationId: string }) {
  const note = useWorkspace((s) => s.notes[conversationId]);
  const setNote = useWorkspace((s) => s.setNote);
  const [value, setValue] = useState(note?.body ?? "");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (value === (useWorkspace.getState().notes[conversationId]?.body ?? "")) return;
    const t = setTimeout(() => {
      setNote(conversationId, value);
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    }, 500);
    return () => clearTimeout(t);
  }, [value, conversationId, setNote]);

  return (
    <Section title="Private notes" action={saved ? <span className="text-[0.6875rem] text-success">Saved</span> : <StickyNote className="size-3 text-fg-4" />}>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        placeholder="Only you can see this…"
        aria-label="Private notes"
        className="min-h-[72px] bg-surface-sunken/60 text-xs"
      />
      {note?.updatedAt ? <p className="mt-1 text-[0.6875rem] text-fg-4">Edited {formatRelative(note.updatedAt)}</p> : null}
    </Section>
  );
}
