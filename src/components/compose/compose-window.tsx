"use client";

import { ChevronDown, Lock, Maximize2, Minimize2, Minus, Paperclip, Send, Trash2, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PLATFORMS, capabilitiesFor } from "@/lib/platforms";
import { inboxHref } from "@/lib/routes";
import type { Account, Attachment, PlatformId } from "@/lib/types";
import { cn, formatBytes, modKey, uid } from "@/lib/utils";
import { useUI } from "@/store/ui";
import { useWorkspace } from "@/store/workspace";
import { PlatformIcon } from "../brand/platform-icon";
import { Avatar } from "../ui/avatar";
import { Button, IconButton } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "../ui/menu";
import { Tooltip } from "../ui/tooltip";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Suggestion {
  id: string;
  label: string;
  value: string;
  hue?: number;
  detail?: string;
}

export function ComposeWindow() {
  const compose = useUI((s) => s.compose);
  if (!compose.open) return null;
  return <ComposeInner key={compose.draftId ?? "new"} />;
}

function ComposeInner() {
  const router = useRouter();
  const compose = useUI((s) => s.compose);
  const { closeCompose, setCompose } = useUI.getState();
  const accounts = useWorkspace((s) => s.accounts);
  const contacts = useWorkspace((s) => s.contacts);
  const conversations = useWorkspace((s) => s.conversations);
  const send = useWorkspace((s) => s.send);
  const saveDraft = useWorkspace((s) => s.saveDraft);
  const deleteDraft = useWorkspace((s) => s.deleteDraft);

  const platforms = useMemo(() => Array.from(new Set(accounts.map((a) => a.platform))), [accounts]);
  const defaultAccount = useMemo(() => {
    if (compose.accountId) return accounts.find((a) => a.id === compose.accountId);
    const composable = accounts.filter((a) => capabilitiesFor(a.platform, a.capabilityOverrides).compose && a.status !== "needs_reauth");
    return composable.find((a) => a.isDefaultSender) ?? composable[0] ?? accounts[0];
  }, [accounts, compose.accountId]);

  const [platform, setPlatform] = useState<PlatformId | undefined>(compose.platform ?? defaultAccount?.platform);
  const [accountId, setAccountId] = useState<string | undefined>(defaultAccount?.id);
  const [to, setTo] = useState<string[]>(compose.to ?? []);
  const [toInput, setToInput] = useState("");
  const [subject, setSubject] = useState(compose.subject ?? "");
  const [body, setBody] = useState(compose.body ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [toFocused, setToFocused] = useState(false);
  const clientId = useRef(uid("cl"));
  const draftId = useRef(compose.draftId);
  const fileRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const account = accounts.find((a) => a.id === accountId);
  const platformAccounts = accounts.filter((a) => a.platform === platform);
  const caps = account ? capabilitiesFor(account.platform, account.capabilityOverrides) : null;
  const isEmail = platform === "gmail" || platform === "outlook" || platform === "imap";
  const blockReason = !account
    ? "Choose an account to send from."
    : !caps?.compose
      ? account.platform === "telegram" && caps?.reply
        ? "Telegram bots can't start conversations. They can only reply to people who message them first."
        : (account.statusMessage ?? PLATFORMS[account.platform].limitation ?? "This account can't start new conversations.")
      : account.status === "needs_reauth"
        ? `${account.label} needs to reconnect before it can send.`
        : null;

  // When platform changes, pick its default account
  const choosePlatform = (p: PlatformId) => {
    setPlatform(p);
    const pa = accounts.filter((a) => a.platform === p);
    const next = pa.find((a) => a.isDefaultSender) ?? pa.find((a) => capabilitiesFor(a.platform, a.capabilityOverrides).compose) ?? pa[0];
    setAccountId(next?.id);
    setTo([]);
    setError(null);
  };

  useEffect(() => {
    requestAnimationFrame(() => (to.length ? bodyRef.current : toRef.current)?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suggestions: Suggestion[] = useMemo(() => {
    if (!platform) return [];
    const q = toInput.trim().toLowerCase();
    const out: Suggestion[] = [];
    for (const c of contacts) {
      const values = isEmail ? c.emails : c.handles.filter((h) => h.platform === platform && (!h.accountId || h.accountId === accountId)).map((h) => h.value);
      for (const v of values) {
        if (to.includes(v)) continue;
        if (q && !c.name.toLowerCase().includes(q) && !v.toLowerCase().includes(q)) continue;
        out.push({ id: `${c.id}:${v}`, label: c.name, value: v, hue: c.avatarHue, detail: v });
      }
    }
    if (platform === "slack") {
      for (const conv of conversations.filter((x) => x.accountId === accountId && x.kind === "channel")) {
        const v = `#${conv.title}`;
        if (to.includes(v) || (q && !v.includes(q))) continue;
        out.push({ id: conv.id, label: v, value: v, detail: "Channel" });
      }
    }
    return out.slice(0, 6);
  }, [contacts, conversations, platform, accountId, toInput, to, isEmail]);

  const addRecipient = (v: string) => {
    const value = v.trim().replace(/,$/, "");
    if (!value) return;
    if (isEmail && !EMAIL_RE.test(value)) {
      toast.error("That doesn't look like an email address", { description: value });
      return;
    }
    if (!to.includes(value)) setTo((t) => [...t, value]);
    setToInput("");
    setActiveSuggestion(0);
  };

  const hasContent = body.trim() || subject.trim() || to.length > 0;

  const persistDraft = () => {
    if (!account || !hasContent) return;
    draftId.current = saveDraft({ id: draftId.current, accountId: account.id, to, subject: isEmail ? subject : undefined, body });
  };

  const close = (opts?: { discard?: boolean }) => {
    if (opts?.discard) {
      if (draftId.current) deleteDraft(draftId.current);
    } else if (hasContent && !sending) {
      persistDraft();
      toast("Saved to drafts", { action: { label: "View", onClick: () => router.push(inboxHref({ folder: "drafts" })) } });
    }
    closeCompose();
  };

  const doSend = async () => {
    if (blockReason || !account || sending) return;
    const pending = toInput.trim();
    const recipients = pending ? [...to, pending] : to;
    if (recipients.length === 0) {
      setError({ message: "Add at least one recipient.", retryable: false });
      toRef.current?.focus();
      return;
    }
    if (isEmail && recipients.some((r) => !EMAIL_RE.test(r))) {
      setError({ message: "One of the recipients isn't a valid email address.", retryable: false });
      return;
    }
    if (!body.trim()) {
      setError({ message: "Write a message before sending.", retryable: false });
      bodyRef.current?.focus();
      return;
    }
    setSending(true);
    setError(null);
    // The same clientId is reused for retries, so a retry can't double-send.
    const result = await send({ clientId: clientId.current, accountId: account.id, to: recipients, subject: isEmail ? subject.trim() || "(no subject)" : undefined, body: body.trim(), attachments });
    setSending(false);
    if (result.ok) {
      if (draftId.current) deleteDraft(draftId.current);
      closeCompose();
      toast.success(account.isDemo ? "Sent (simulated)" : "Sent", {
        description: `${PLATFORMS[account.platform].name} · ${account.label} → ${recipients.join(", ")}`,
        action: { label: "View", onClick: () => router.push(inboxHref({ c: result.conversationId })) },
      });
    } else {
      // Remove the failed optimistic conversation so a retry starts clean; the composer keeps the content.
      useWorkspace.getState().discardFailed(`cv_${clientId.current}`, `msg_${clientId.current}`);
      setError({ message: result.error, retryable: result.retryable });
    }
  };

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    const next: Attachment[] = [];
    for (const f of Array.from(list)) {
      if (f.size > 25 * 1024 * 1024) {
        toast.error(`${f.name} is too large`, { description: "Attachments can be up to 25 MB." });
        continue;
      }
      next.push({ id: uid("att"), name: f.name, mimeType: f.type || "application/octet-stream", size: f.size, url: URL.createObjectURL(f) });
    }
    setAttachments((a) => [...a, ...next]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void doSend();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  if (compose.minimized) {
    return (
      <button
        onClick={() => setCompose({ minimized: false })}
        className="fixed bottom-0 right-6 z-50 flex h-10 w-[300px] items-center gap-2 rounded-t-lg border border-b-0 border-line bg-surface-raised px-3 text-[0.8125rem] font-medium shadow-lg animate-slide-up"
      >
        {account ? <PlatformIcon platform={account.platform} size={16} /> : null}
        <span className="min-w-0 flex-1 truncate text-left">{subject || (to.length ? `To ${to.join(", ")}` : "New message")}</span>
        <Maximize2 className="size-3.5 text-fg-3" />
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="New message"
      onKeyDown={onKeyDown}
      className={cn(
        "fixed z-50 flex flex-col overflow-hidden border border-line bg-surface-raised shadow-xl animate-scale-in",
        "inset-0 pb-safe pt-safe sm:inset-auto sm:bottom-4 sm:right-4 sm:rounded-lg sm:p-0",
        expanded ? "sm:left-1/2 sm:top-[8vh] sm:bottom-[8vh] sm:w-[760px] sm:-translate-x-1/2" : "sm:h-[min(620px,calc(100vh-2rem))] sm:w-[560px]",
      )}
    >
      {/* Title bar */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line-subtle px-3">
        <span className="text-[0.8125rem] font-semibold">New message</span>
        {account?.isDemo ? <span className="rounded-[4px] bg-warning-soft px-1.5 text-[0.6875rem] font-medium leading-[18px] text-fg-2">Simulated send</span> : null}
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton size="xs" label="Minimize" onClick={() => setCompose({ minimized: true })} className="hidden sm:inline-flex">
            <Minus />
          </IconButton>
          <IconButton size="xs" label={expanded ? "Shrink" : "Expand"} onClick={() => setExpanded((v) => !v)} className="hidden sm:inline-flex">
            {expanded ? <Minimize2 /> : <Maximize2 />}
          </IconButton>
          <IconButton size="xs" label="Close (saves draft)" shortcut="Esc" onClick={() => close()}>
            <X />
          </IconButton>
        </div>
      </div>

      {/* Platform */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line-subtle px-3 py-2 scrollbar-none [mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)]" role="radiogroup" aria-label="Platform">
        {platforms.map((p) => {
          const anyCompose = accounts.some((a) => a.platform === p && capabilitiesFor(a.platform, a.capabilityOverrides).compose);
          return (
            <Tooltip key={p} label={anyCompose ? PLATFORMS[p].name : `${PLATFORMS[p].name}: can't start conversations`}>
              <button
                role="radio"
                aria-checked={platform === p}
                onClick={() => choosePlatform(p)}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
                  platform === p ? "border-fg bg-fg text-fg-inverse" : "border-line text-fg-2 hover:border-line-strong hover:text-fg",
                  !anyCompose && platform !== p && "opacity-55",
                )}
              >
                <PlatformIcon platform={p} size={14} />
                {PLATFORMS[p].shortName}
              </button>
            </Tooltip>
          );
        })}
      </div>

      {/* From */}
      <Row label="From">
        <Menu>
          <MenuTrigger asChild>
            <button className="-ml-1.5 inline-flex h-7 min-w-0 items-center gap-2 rounded-[6px] px-1.5 text-[0.8125rem] hover:bg-hover" aria-label="Sending account">
              {account ? (
                <>
                  <span className="font-medium">{account.label}</span>
                  <span className="truncate text-fg-3">{account.handle}</span>
                </>
              ) : (
                <span className="text-fg-3">Choose account</span>
              )}
              <ChevronDown className="size-3.5 shrink-0 text-fg-4" />
            </button>
          </MenuTrigger>
          <MenuContent className="w-72">
            <MenuLabel>{platform ? PLATFORMS[platform].name : "Accounts"}</MenuLabel>
            {platformAccounts.map((a) => (
              <AccountOption key={a.id} account={a} onSelect={() => (setAccountId(a.id), setError(null))} selected={a.id === accountId} />
            ))}
          </MenuContent>
        </Menu>
      </Row>

      {blockReason ? (
        <div className="m-3 flex items-start gap-2.5 rounded-md border border-dashed border-line-strong bg-surface-sunken p-3 text-xs leading-[1.125rem] text-fg-2">
          {account?.status === "needs_reauth" ? <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" /> : <Lock className="mt-px size-3.5 shrink-0 text-fg-3" />}
          <div className="min-w-0 flex-1">
            <p className="font-medium text-fg">Can&apos;t send from this account</p>
            <p className="mt-0.5">{blockReason}</p>
            {account?.status === "needs_reauth" ? (
              <Button size="xs" variant="primary" className="mt-2" onClick={() => (closeCompose(), router.push(`/settings?tab=accounts&reconnect=${account.id}`))}>
                Reconnect
              </Button>
            ) : account && PLATFORMS[account.platform].alternative ? (
              <a className="mt-2 inline-block font-medium text-accent-text hover:underline" href={PLATFORMS[account.platform].alternative!.url} target="_blank" rel="noreferrer">
                {PLATFORMS[account.platform].alternative!.label} ↗
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {/* To */}
          <Row label="To">
            <div className="relative flex min-w-0 flex-1 flex-wrap items-center gap-1 py-1">
              {to.map((r) => (
                <span key={r} className="inline-flex h-6 items-center gap-1 rounded-full bg-hover pl-2 pr-1 text-xs font-medium text-fg">
                  {contacts.find((c) => c.emails.includes(r) || c.handles.some((h) => h.value === r))?.name ?? r}
                  <button aria-label={`Remove ${r}`} onClick={() => setTo((t) => t.filter((x) => x !== r))} className="rounded-full p-0.5 text-fg-3 hover:bg-active hover:text-fg">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                ref={toRef}
                value={toInput}
                onChange={(e) => {
                  setToInput(e.target.value);
                  setActiveSuggestion(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveSuggestion((i) => Math.min(i + 1, suggestions.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveSuggestion((i) => Math.max(i - 1, 0));
                  } else if ((e.key === "Enter" || e.key === "Tab") && (suggestions[activeSuggestion] || toInput.trim())) {
                    if (e.key === "Tab" && !toInput.trim()) return;
                    e.preventDefault();
                    addRecipient(suggestions[activeSuggestion]?.value ?? toInput);
                  } else if (e.key === "," || e.key === " ") {
                    if (toInput.trim() && isEmail) {
                      e.preventDefault();
                      addRecipient(toInput);
                    }
                  } else if (e.key === "Backspace" && !toInput && to.length) {
                    setTo((t) => t.slice(0, -1));
                  }
                }}
                onFocus={() => setToFocused(true)}
                onBlur={() => {
                  setToFocused(false);
                  if (toInput.trim() && isEmail && EMAIL_RE.test(toInput.trim())) addRecipient(toInput);
                }}
                placeholder={to.length ? "" : isEmail ? "Name or email" : platform === "slack" ? "Person or #channel" : "Search people"}
                aria-label="Recipients"
                className="h-6 min-w-[120px] flex-1 bg-transparent text-[0.8125rem] outline-none placeholder:text-fg-4"
              />
              {toFocused || toInput ? (
                suggestions.length > 0 ? (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-md border border-line bg-surface-raised p-1 shadow-lg" role="listbox">
                    {suggestions.map((s, i) => (
                      <button
                        key={s.id}
                        role="option"
                        aria-selected={i === activeSuggestion}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          addRecipient(s.value);
                        }}
                        onMouseEnter={() => setActiveSuggestion(i)}
                        className={cn("flex w-full items-center gap-2.5 rounded-[5px] px-2 py-1.5 text-left", i === activeSuggestion && "bg-hover")}
                      >
                        <Avatar name={s.label} hue={s.hue} size="xs" group={s.label.startsWith("#")} />
                        <span className="text-[0.8125rem] font-medium">{s.label}</span>
                        <span className="truncate text-xs text-fg-3">{s.detail !== s.label ? s.detail : ""}</span>
                      </button>
                    ))}
                  </div>
                ) : null
              ) : null}
            </div>
          </Row>

          {isEmail ? (
            <Row label="Subject">
              <input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" placeholder="What's this about?" className="h-9 w-full bg-transparent text-[0.8125rem] font-medium outline-none placeholder:font-normal placeholder:text-fg-4" />
            </Row>
          ) : null}

          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={isEmail ? "Write your message…" : `Message on ${platform ? PLATFORMS[platform].name : ""}…`}
            aria-label="Message"
            className="min-h-0 w-full flex-1 resize-none bg-transparent px-4 py-3 text-[0.875rem] leading-[1.6] outline-none placeholder:text-fg-4"
          />

          {attachments.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 px-3 pb-2">
              {attachments.map((a) => (
                <span key={a.id} className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-line bg-surface-sunken pl-2 pr-1 text-xs">
                  <Paperclip className="size-3 text-fg-3" />
                  <span className="max-w-[180px] truncate">{a.name}</span>
                  <span className="text-fg-4">{formatBytes(a.size)}</span>
                  <button aria-label={`Remove ${a.name}`} className="rounded-[4px] p-0.5 text-fg-4 hover:bg-hover hover:text-fg" onClick={() => setAttachments((xs) => xs.filter((x) => x.id !== a.id))}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </>
      )}

      {error ? (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-[6px] bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">
          <TriangleAlert className="size-3.5 shrink-0" />
          <span className="flex-1 font-medium">{error.message}</span>
          {error.retryable ? (
            <Button size="xs" variant="secondary" onClick={() => void doSend()}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Footer */}
      <div className="flex shrink-0 items-center gap-1 border-t border-line-subtle px-3 py-2.5">
        <Button variant="primary" onClick={() => void doSend()} disabled={!!blockReason} loading={sending}>
          {!sending ? <Send /> : null}
          {sending ? "Sending…" : "Send"}
        </Button>
        <Kbd className="ml-1.5 hidden sm:inline-flex">{`${modKey()} ↵`}</Kbd>
        {caps?.attachments && !blockReason ? (
          <>
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => (onFiles(e.target.files), (e.target.value = ""))} />
            <IconButton label="Attach files" className="ml-1" onClick={() => fileRef.current?.click()}>
              <Paperclip />
            </IconButton>
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          {hasContent && !blockReason ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                persistDraft();
                toast("Draft saved");
              }}
            >
              Save draft
            </Button>
          ) : null}
          <IconButton
            label="Discard"
            onClick={() => {
              close({ discard: true });
              if (hasContent) toast("Draft discarded");
            }}
          >
            <Trash2 />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-10 shrink-0 items-center gap-3 border-b border-line-subtle px-4">
      <span className="w-12 shrink-0 text-xs text-fg-3">{label}</span>
      {children}
    </div>
  );
}

function AccountOption({ account, onSelect, selected }: { account: Account; onSelect: () => void; selected: boolean }) {
  const caps = capabilitiesFor(account.platform, account.capabilityOverrides);
  const note = !caps.compose ? (caps.reply ? "Reply only" : "Read only") : account.status === "needs_reauth" ? "Reconnect needed" : account.isDefaultSender ? "Default" : null;
  return (
    <MenuItem onSelect={onSelect} className={cn("h-auto py-1.5", selected && "bg-hover")}>
      <PlatformIcon platform={account.platform} size={16} />
      <span className="min-w-0 flex-1">
        <span className="block text-[0.8125rem] font-medium">{account.label}</span>
        <span className="block truncate text-xs text-fg-3">{account.handle}</span>
      </span>
      {note ? <span className={cn("shrink-0 text-[0.6875rem]", note === "Default" ? "text-fg-3" : "text-warning")}>{note}</span> : null}
    </MenuItem>
  );
}
