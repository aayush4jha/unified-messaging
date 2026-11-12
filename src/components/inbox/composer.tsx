"use client";

import { addDays, format, nextMonday, setHours, setMinutes } from "date-fns";
import { ChevronDown, Clock, ExternalLink, Lock, Paperclip, Send, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PLATFORMS, capabilitiesFor } from "@/lib/platforms";
import type { Account, Attachment, Conversation, Message } from "@/lib/types";
import { cn, formatBytes, modKey, uid } from "@/lib/utils";
import { useNow } from "@/store/selectors";
import { useUI } from "@/store/ui";
import { useWorkspace } from "@/store/workspace";
import { Button, IconButton } from "../ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/controls";
import { Kbd } from "../ui/kbd";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "../ui/menu";
import { CustomDateTimeForm } from "./actions";

const MAX_ATTACHMENT = 25 * 1024 * 1024;
const WINDOW_PLATFORMS = new Set(["whatsapp", "instagram", "messenger"]);

/** Why replying is blocked, if it is. */
export function replyBlock(account: Account | undefined, conversation: Conversation, messages: Message[]): { reason: string; kind: "auth" | "unsupported" | "window" } | null {
  if (!account) return { reason: "This account is no longer connected.", kind: "auth" };
  const caps = capabilitiesFor(account.platform, account.capabilityOverrides);
  if (!caps.reply) return { reason: account.statusMessage ?? PLATFORMS[account.platform].limitation ?? "Replying isn't supported for this account.", kind: "unsupported" };
  if (account.status === "needs_reauth") return { reason: `${account.label} needs to reconnect before you can reply.`, kind: "auth" };
  if (WINDOW_PLATFORMS.has(account.platform)) {
    const lastIn = [...messages].reverse().find((m) => m.authorId !== "me");
    if (lastIn && Date.now() - new Date(lastIn.sentAt).getTime() > 24 * 3_600_000) {
      return {
        reason: `${PLATFORMS[account.platform].name} only allows free-form replies within 24 hours of the customer's last message. After that, only approved templates can be sent.`,
        kind: "window",
      };
    }
  }
  return null;
}

export interface Prefill {
  id: number;
  text: string;
}

export function ReplyComposer({ conversation: c, account, messages, prefill }: { conversation: Conversation; account?: Account; messages: Message[]; prefill?: Prefill | null }) {
  const send = useWorkspace((s) => s.send);
  const schedule = useWorkspace((s) => s.schedule);
  const saveDraft = useWorkspace((s) => s.saveDraft);
  const deleteDraft = useWorkspace((s) => s.deleteDraft);
  const existingDraft = useWorkspace((s) => s.drafts.find((d) => d.conversationId === c.id));
  const sendShortcut = useWorkspace((s) => s.prefs.sendShortcut);
  const undoSeconds = useWorkspace((s) => s.prefs.undoSendSeconds);
  const focusTick = useUI((s) => s.focusComposerTick);

  const isEmail = c.kind === "email";
  const caps = account ? capabilitiesFor(account.platform, account.capabilityOverrides) : null;
  const block = replyBlock(account, c, messages);

  const [body, setBody] = useState(existingDraft?.body ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [replyAll, setReplyAll] = useState(false);
  const [holding, setHolding] = useState<{ until: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [clock, setClock] = useState(0);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const draftId = useRef(existingDraft?.id);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastHeld = useRef<{ text: string; files: Attachment[] } | null>(null);

  // External prefill (smart replies / AI drafts). It only fills the editor and never sends.
  // Derived during render; the parent remounts this component per conversation.
  const [appliedPrefill, setAppliedPrefill] = useState<number | null>(null);
  if (prefill && prefill.id !== appliedPrefill) {
    setAppliedPrefill(prefill.id);
    setBody(prefill.text);
  }
  useEffect(() => {
    if (appliedPrefill === null) return;
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, [appliedPrefill]);

  useEffect(() => {
    if (focusTick > 0) taRef.current?.focus();
  }, [focusTick]);

  // Autosize
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = `${Math.min(ta.scrollHeight, isEmail ? 320 : 180)}px`;
  }, [body, isEmail]);

  const recipients = useMemo(() => {
    const lastIn = [...messages].reverse().find((m) => m.authorId !== "me");
    const sender = c.participants.find((p) => p.id === lastIn?.authorId) ?? c.participants[0];
    if (!isEmail) return c.participants.map((p) => p.handle ?? p.name);
    const primary = sender?.handle ? [sender.handle] : [];
    if (!replyAll) return primary;
    return Array.from(new Set([...primary, ...c.participants.map((p) => p.handle).filter(Boolean)])) as string[];
  }, [messages, c.participants, isEmail, replyAll]);

  // Draft autosave (debounced)
  useEffect(() => {
    if (block) return;
    const t = setTimeout(() => {
      if (body.trim()) {
        draftId.current = saveDraft({
          id: draftId.current,
          accountId: c.accountId,
          conversationId: c.id,
          to: recipients,
          subject: isEmail ? `Re: ${c.title.replace(/^Re:\s*/i, "")}` : undefined,
          body,
        });
      } else if (draftId.current) {
        deleteDraft(draftId.current);
        draftId.current = undefined;
      }
    }, 700);
    return () => clearTimeout(t);
  }, [body, block, c.accountId, c.id, c.title, isEmail, recipients, saveDraft, deleteDraft]);

  // Countdown re-render
  useEffect(() => {
    if (!holding) return;
    const i = setInterval(() => setClock(Date.now()), 200);
    return () => clearInterval(i);
  }, [holding]);
  const now = useNow();

  if (block) return <BlockedComposer block={block} account={account} conversation={c} />;

  const canSend = body.trim().length > 0 && !holding;

  const dispatch = async (text: string, files: Attachment[], to: string[]) => {
    const clientId = uid("cl");
    if (draftId.current) {
      deleteDraft(draftId.current);
      draftId.current = undefined;
    }
    const result = await send({
      clientId,
      accountId: c.accountId,
      conversationId: c.id,
      to,
      subject: isEmail ? `Re: ${c.title.replace(/^Re:\s*/i, "")}` : undefined,
      body: text,
      attachments: files,
    });
    if (!result.ok) toast.error("Message not sent", { description: result.error });
  };

  const submit = () => {
    if (!canSend) return;
    const text = body.trim();
    const files = attachments;
    const to = recipients;
    setBody("");
    setAttachments([]);
    if (undoSeconds > 0) {
      const timer = setTimeout(() => {
        setHolding(null);
        void dispatch(text, files, to);
      }, undoSeconds * 1000);
      const until = Date.now() + undoSeconds * 1000;
      setClock(Date.now());
      setHolding({ until, timer });
      // keep the text so Undo can restore it
      lastHeld.current = { text, files };
    } else {
      void dispatch(text, files, to);
    }
  };

  const undo = () => {
    if (!holding) return;
    clearTimeout(holding.timer);
    setHolding(null);
    if (lastHeld.current) {
      setBody(lastHeld.current.text);
      setAttachments(lastHeld.current.files);
    }
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const sendNow = () => {
    if (!holding) return;
    clearTimeout(holding.timer);
    setHolding(null);
    if (lastHeld.current) void dispatch(lastHeld.current.text, lastHeld.current.files, recipients);
  };

  const doSchedule = (at: Date) => {
    if (!body.trim()) return;
    schedule({
      accountId: c.accountId,
      conversationId: c.id,
      to: recipients,
      subject: isEmail ? `Re: ${c.title.replace(/^Re:\s*/i, "")}` : undefined,
      body: body.trim(),
      sendAt: at.toISOString(),
    });
    if (draftId.current) deleteDraft(draftId.current);
    draftId.current = undefined;
    setBody("");
    setScheduleOpen(false);
    toast(`Scheduled for ${format(at, "EEE, MMM d 'at' h:mm a")}`, { description: "Find it in Scheduled. Orbit sends it at that time." });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Enter" && (mod || (sendShortcut === "enter" && !isEmail && !e.shiftKey))) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
  };

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    const next: Attachment[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_ATTACHMENT) {
        toast.error(`${f.name} is too large`, { description: "Attachments can be up to 25 MB." });
        continue;
      }
      next.push({ id: uid("att"), name: f.name, mimeType: f.type || "application/octet-stream", size: f.size, url: URL.createObjectURL(f) });
    }
    setAttachments((a) => [...a, ...next]);
  };

  const remainingMs = holding ? Math.max(0, holding.until - clock) : 0;
  const remaining = Math.ceil(remainingMs / 1000);
  const placeholder = isEmail
    ? `Reply to ${c.participants[0]?.name.split(" ")[0] ?? ""}…`
    : c.kind === "channel"
      ? `Message #${c.title}`
      : `Message ${c.title}`;

  return (
    <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
      <div
        className={cn(
          "mx-auto w-full rounded-lg border border-line bg-surface shadow-sm transition-[border-color,box-shadow] focus-within:border-line-strong focus-within:shadow-md",
          isEmail ? "max-w-[780px]" : "max-w-[760px]",
        )}
      >
        {isEmail ? (
          <div className="flex items-center gap-2 border-b border-line-subtle px-3.5 py-2 text-xs text-fg-3">
            <span className="shrink-0">To</span>
            <span className="min-w-0 flex-1 truncate text-fg-2">{recipients.join(", ")}</span>
            {c.participants.length > 1 ? (
              <button onClick={() => setReplyAll((v) => !v)} className={cn("shrink-0 rounded-[4px] px-1.5 py-0.5 font-medium hover:bg-hover", replyAll ? "text-accent-text" : "text-fg-3")}>
                {replyAll ? "Reply all ✓" : "Reply all"}
              </button>
            ) : null}
            <span className="hidden shrink-0 text-fg-4 sm:inline">from {account?.handle}</span>
          </div>
        ) : null}

        {holding ? (
          <div className="flex items-center gap-3 px-3.5 py-3 text-[0.8125rem] animate-fade-in" role="status">
            <span className="relative inline-flex size-6 items-center justify-center">
              <svg viewBox="0 0 24 24" className="absolute inset-0 -rotate-90">
                <circle cx="12" cy="12" r="10" fill="none" stroke="var(--border)" strokeWidth="2" />
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeDasharray={62.8}
                  strokeDashoffset={62.8 * (1 - remainingMs / (undoSeconds * 1000))}
                  style={{ transition: "stroke-dashoffset 250ms linear" }}
                />
              </svg>
              <span className="tabular text-[0.625rem] font-semibold">{remaining}</span>
            </span>
            <span className="text-fg-2">Sending in {remaining}s…</span>
            <Button size="xs" variant="secondary" className="ml-auto" onClick={undo}>
              Undo
            </Button>
            <Button size="xs" variant="ghost" onClick={sendNow}>
              Send now
            </Button>
          </div>
        ) : (
          <textarea
            ref={taRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={isEmail ? 3 : 1}
            aria-label="Reply"
            className="block w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-[0.875rem] leading-[1.55] text-fg outline-none placeholder:text-fg-4"
          />
        )}

        {attachments.length > 0 && !holding ? (
          <div className="flex flex-wrap gap-1.5 px-3 pb-1 pt-1">
            {attachments.map((a) => (
              <span key={a.id} className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-line bg-surface-sunken pl-2 pr-1 text-xs">
                <Paperclip className="size-3 text-fg-3" />
                <span className="max-w-[160px] truncate">{a.name}</span>
                <span className="text-fg-4">{formatBytes(a.size)}</span>
                <button aria-label={`Remove ${a.name}`} className="rounded-[4px] p-0.5 text-fg-4 hover:bg-hover hover:text-fg" onClick={() => setAttachments((xs) => xs.filter((x) => x.id !== a.id))}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {!holding ? (
          <div className="flex items-center gap-1 px-2 pb-2 pt-1">
            {caps?.attachments ? (
              <>
                <input ref={fileRef} type="file" multiple hidden onChange={(e) => (onFiles(e.target.files), (e.target.value = ""))} />
                <IconButton size="sm" label="Attach files" onClick={() => fileRef.current?.click()}>
                  <Paperclip />
                </IconButton>
              </>
            ) : null}
            {existingDraft && body.trim() ? <span className="ml-1 text-[0.6875rem] text-fg-4">Draft saved</span> : null}
            <span className="ml-auto hidden items-center gap-1 text-[0.6875rem] text-fg-4 sm:inline-flex">
              {sendShortcut === "enter" && !isEmail ? <Kbd>↵</Kbd> : <Kbd>{`${modKey()} ↵`}</Kbd>} to send
            </span>
            <div className="ml-2 flex items-center">
              <Button size="sm" variant="primary" disabled={!canSend} onClick={submit} className={cn(caps?.schedule && "rounded-r-none")}>
                <Send /> Send
              </Button>
              {caps?.schedule ? (
                <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
                  <PopoverAnchor asChild>
                  <span className="inline-flex">
                  <Menu>
                    <MenuTrigger asChild>
                      <button
                        disabled={!canSend}
                        aria-label="Schedule send"
                        className="inline-flex h-7 items-center rounded-r-sm border-l border-accent-contrast/20 bg-accent px-1.5 text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-45"
                      >
                        <ChevronDown className="size-3.5" />
                      </button>
                    </MenuTrigger>
                    <MenuContent align="end">
                      <MenuLabel>Schedule send</MenuLabel>
                      <MenuItem onSelect={() => doSchedule(setMinutes(setHours(addDays(new Date(), 1), 8), 0))}>
                        <Clock /> Tomorrow morning <span className="ml-auto pl-3 text-xs text-fg-3">8:00 AM</span>
                      </MenuItem>
                      <MenuItem onSelect={() => doSchedule(setMinutes(setHours(nextMonday(new Date()), 8), 0))}>
                        <Clock /> Monday morning <span className="ml-auto pl-3 text-xs text-fg-3">{format(nextMonday(new Date(now)), "MMM d")}</span>
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem onSelect={() => setTimeout(() => setScheduleOpen(true), 0)}>Pick date & time…</MenuItem>
                    </MenuContent>
                  </Menu>
                  </span>
                  </PopoverAnchor>
                  <PopoverContent align="end" side="top">
                    <p className="mb-2 text-xs font-medium text-fg-2">Send at</p>
                    <CustomDateTimeForm submitLabel="Schedule" onSubmit={doSchedule} onCancel={() => setScheduleOpen(false)} />
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BlockedComposer({ block, account, conversation }: { block: NonNullable<ReturnType<typeof replyBlock>>; account?: Account; conversation: Conversation }) {
  const info = account ? PLATFORMS[account.platform] : undefined;
  return (
    <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
      <div className="mx-auto flex w-full max-w-[780px] flex-wrap items-start gap-x-3 gap-y-2.5 rounded-lg border border-dashed border-line-strong bg-surface-sunken px-4 py-3">
        {block.kind === "auth" ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" /> : <Lock className="mt-0.5 size-4 shrink-0 text-fg-3" />}
        <div className="min-w-[12rem] flex-1">
          <p className="text-[0.8125rem] font-medium text-fg">
            {block.kind === "auth" ? "Reconnect to reply" : block.kind === "window" ? "Reply window closed" : "Replying isn't available here"}
          </p>
          <p className="mt-0.5 text-xs leading-[1.125rem] text-fg-3">{block.reason}</p>
        </div>
        <div className="flex shrink-0 gap-1.5 max-sm:ml-7">
          {block.kind === "auth" && account ? (
            <Button asChild size="sm" variant="primary">
              <Link href={`/settings?tab=accounts&reconnect=${account.id}`}>Reconnect</Link>
            </Button>
          ) : null}
          {(block.kind !== "auth" && (conversation.externalUrl || info?.alternative)) ? (
            <Button asChild size="sm">
              <a href={conversation.externalUrl ?? info!.alternative!.url} target="_blank" rel="noreferrer">
                Open in {info?.shortName} <ExternalLink />
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
