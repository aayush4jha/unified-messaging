"use client";

import { addDays, setHours, setMinutes } from "date-fns";
import { ArrowRight, BellPlus, ChevronDown, FileText, Lock, RotateCw, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { AIError, callAI, toTranscript } from "@/lib/ai-client";
import { capabilitiesFor } from "@/lib/platforms";
import type { Conversation, Message } from "@/lib/types";
import { useServerStatus } from "@/lib/use-connectors";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/store/workspace";
import { Button, Spinner } from "../ui/button";
import { Tooltip } from "../ui/tooltip";

type Tone = "professional" | "casual" | "short" | "detailed" | "follow_up";
const TONES: { id: Tone; label: string }[] = [
  { id: "professional", label: "Professional" },
  { id: "casual", label: "Casual" },
  { id: "short", label: "Short" },
  { id: "detailed", label: "Detailed" },
  { id: "follow_up", label: "Follow-up" },
];

interface Summary {
  overview: string;
  decisions: string[];
  pendingActions: { owner: "you" | "them" | "unclear"; action: string; due: string }[];
  people: { name: string; role: string }[];
  nextSteps: string[];
}

/** Per-conversation cache so switching back and forth doesn't re-bill. */
const summaryCache = new Map<string, { summary: Summary; omitted: number; key: string }>();
const repliesCache = new Map<string, { replies: { tone: Tone; text: string }[]; key: string }>();

export function AIPanel({ conversation: c, messages, needsReply, onUseReply }: { conversation: Conversation; messages: Message[]; needsReply: boolean; onUseReply: (text: string) => void }) {
  const account = useWorkspace((s) => s.accounts.find((a) => a.id === c.accountId));
  const aiEnabled = useWorkspace((s) => s.prefs.aiEnabled);
  const smartReplies = useWorkspace((s) => s.prefs.smartReplies);
  const addReminder = useWorkspace((s) => s.addReminder);
  const { status } = useServerStatus();
  const cacheKey = `${c.id}:${messages.length}:${messages[messages.length - 1]?.id}`;

  const [summary, setSummary] = useState(() => (summaryCache.get(c.id)?.key === cacheKey ? summaryCache.get(c.id)! : null));
  const [replies, setReplies] = useState(() => (repliesCache.get(c.id)?.key === cacheKey ? repliesCache.get(c.id)!.replies : null));
  const [loading, setLoading] = useState<"summary" | "replies" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const caps = account ? capabilitiesFor(account.platform, account.capabilityOverrides) : null;
  const canReply = !!caps?.reply && account?.status !== "needs_reauth";
  const configured = status?.backend.ai;
  const longEnough = messages.length >= 3 || messages.some((m) => m.body.length > 600);

  if (!aiEnabled) return null;
  if (!longEnough && !(needsReply && canReply && smartReplies)) return null;

  if (account && !account.aiEnabled) {
    return (
      <div className="mb-3 flex items-center gap-2 text-xs text-fg-4">
        <Lock className="size-3" /> AI is off for {account.label}.{" "}
        <Link href="/settings?tab=privacy" className="font-medium text-fg-3 hover:text-fg">
          Change
        </Link>
      </div>
    );
  }

  const transcript = () => toTranscript(c, messages, account);

  const runSummary = async () => {
    setLoading("summary");
    setError(null);
    try {
      const r = await callAI<{ summary: Summary; omittedMessages: number }>({ action: "summarize", conversation: transcript() });
      const entry = { summary: r.summary, omitted: r.omittedMessages, key: cacheKey };
      summaryCache.set(c.id, entry);
      setSummary(entry);
      setOpen(true);
    } catch (e) {
      setError(e instanceof AIError ? e.message : "Couldn't summarize this conversation.");
    } finally {
      setLoading(null);
    }
  };

  const runReplies = async () => {
    setLoading("replies");
    setError(null);
    try {
      const tones: Tone[] = c.kind === "email" ? ["professional", "short", "detailed", "follow_up"] : ["casual", "short", "professional"];
      const r = await callAI<{ replies: { tone: Tone; text: string }[] }>({ action: "replies", conversation: transcript(), tones });
      repliesCache.set(c.id, { replies: r.replies, key: cacheKey });
      setReplies(r.replies);
    } catch (e) {
      setError(e instanceof AIError ? e.message : "Couldn't suggest replies.");
    } finally {
      setLoading(null);
    }
  };

  const trackAction = (action: string, due: string) => {
    const dueAt = setMinutes(setHours(addDays(new Date(), 1), 9), 0);
    addReminder({ kind: "task", title: action, conversationId: c.id, contactId: c.contactId, dueAt: dueAt.toISOString(), note: due ? `Mentioned deadline: ${due}` : undefined, source: "suggestion" });
    toast("Added to follow-ups", { description: action });
  };

  // AI not configured on the server: one quiet line, no dead buttons.
  if (status && !configured) {
    return (
      <div className="mb-3 flex items-center gap-2 text-xs text-fg-4">
        <Sparkles className="size-3" /> Summaries and smart replies need an Anthropic API key on the server (ANTHROPIC_API_KEY).
      </div>
    );
  }

  return (
    <div className="mb-3 space-y-2.5">
      {!summary || (!replies && needsReply && canReply && smartReplies) ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {!summary && longEnough ? (
            <Button size="xs" variant="secondary" onClick={runSummary} disabled={!!loading}>
              {loading === "summary" ? <Spinner /> : <FileText />} Summarize
            </Button>
          ) : null}
          {!replies && needsReply && canReply && smartReplies ? (
            <Button size="xs" variant="secondary" onClick={runReplies} disabled={!!loading}>
              {loading === "replies" ? <Spinner /> : <Sparkles />} Suggest replies
            </Button>
          ) : null}
          {loading ? <span className="text-xs text-fg-3">{loading === "summary" ? "Reading the conversation…" : "Drafting replies…"}</span> : null}
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center gap-2 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      {summary ? (
        <section className="overflow-hidden rounded-lg border border-line bg-surface shadow-xs animate-slide-up" aria-label="AI summary">
          <div className="flex items-center gap-1 pr-2">
            <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 px-3.5 py-2.5 text-left" aria-expanded={open}>
              <Sparkles className="size-3.5 shrink-0 text-accent-text" />
              <span className="text-xs font-semibold">Summary</span>
              {summary.omitted ? <span className="truncate text-[0.6875rem] text-fg-4">· latest messages only ({summary.omitted} earlier not included)</span> : null}
              <ChevronDown className={cn("ml-auto size-3.5 shrink-0 text-fg-4 transition-transform", !open && "-rotate-90")} />
            </button>
            <Tooltip label="Regenerate">
              <button onClick={() => void runSummary()} disabled={!!loading} className="inline-flex size-6 items-center justify-center rounded-[5px] text-fg-4 hover:bg-hover hover:text-fg" aria-label="Regenerate summary">
                {loading === "summary" ? <Spinner /> : <RotateCw className="size-3" />}
              </button>
            </Tooltip>
          </div>
          {open ? (
            <div className="space-y-3 border-t border-line-subtle px-3.5 py-3 text-[0.8125rem] leading-5">
              <p className="text-fg">{summary.summary.overview}</p>
              {summary.summary.decisions.length ? <List title="Decisions" items={summary.summary.decisions} /> : null}
              {summary.summary.pendingActions.length ? (
                <div>
                  <h4 className="mb-1 text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-fg-4">Pending actions</h4>
                  <ul className="space-y-1">
                    {summary.summary.pendingActions.map((a, i) => (
                      <li key={i} className="group flex items-start gap-2">
                        <span className={cn("mt-0.5 shrink-0 rounded-[4px] px-1 text-[0.625rem] font-semibold uppercase leading-4", a.owner === "you" ? "bg-accent-soft text-accent-text" : "bg-hover text-fg-3")}>
                          {a.owner === "you" ? "You" : a.owner === "them" ? "Them" : "?"}
                        </span>
                        <span className="flex-1 text-fg-2">
                          {a.action}
                          {a.due ? <span className="text-fg-3"> · {a.due}</span> : null}
                        </span>
                        {a.owner === "you" ? (
                          <button onClick={() => trackAction(a.action, a.due)} className="inline-flex shrink-0 items-center gap-1 text-[0.6875rem] font-medium text-fg-3 opacity-0 hover:text-fg group-hover:opacity-100 focus:opacity-100">
                            <BellPlus className="size-3" /> Track
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {summary.summary.nextSteps.length ? <List title="Suggested next steps" items={summary.summary.nextSteps} /> : null}
              {summary.summary.people.length ? (
                <p className="text-xs text-fg-3">
                  <span className="font-medium text-fg-2">People: </span>
                  {summary.summary.people.map((p) => `${p.name} (${p.role})`).join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {replies ? (
        <section className="rounded-lg border border-line bg-surface p-3 shadow-xs animate-slide-up" aria-label="Suggested replies">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="size-3.5 text-accent-text" />
            <span className="text-xs font-semibold">Suggested replies</span>
            <span className="text-[0.6875rem] text-fg-4">Opens in the composer for you to edit. Nothing is sent.</span>
            <button onClick={runReplies} disabled={!!loading} className="ml-auto inline-flex size-6 items-center justify-center rounded-[5px] text-fg-4 hover:bg-hover hover:text-fg" aria-label="Regenerate replies">
              {loading === "replies" ? <Spinner /> : <RotateCw className="size-3" />}
            </button>
            <button onClick={() => setReplies(null)} className="inline-flex size-6 items-center justify-center rounded-[5px] text-fg-4 hover:bg-hover hover:text-fg" aria-label="Dismiss suggestions">
              <X className="size-3.5" />
            </button>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {replies.map((r) => (
              <button
                key={r.tone}
                onClick={() => {
                  onUseReply(r.text);
                  toast("Draft added to the composer", { description: "Edit it, then send when you're ready." });
                }}
                className="group rounded-md border border-line px-3 py-2 text-left transition-colors hover:border-accent hover:bg-accent-soft"
              >
                <span className="flex items-center text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-fg-3 group-hover:text-accent-text">
                  {TONES.find((t) => t.id === r.tone)?.label}
                  <ArrowRight className="ml-auto size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                <span className="mt-0.5 line-clamp-3 block text-[0.8125rem] leading-5 text-fg-2">{r.text}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="mb-1 text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-fg-4">{title}</h4>
      <ul className="list-disc space-y-0.5 pl-4 text-fg-2 marker:text-fg-4">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
