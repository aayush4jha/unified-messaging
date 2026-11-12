"use client";

import { format } from "date-fns";
import { AlarmClock, ArrowUp, CalendarClock, Hourglass, Info, MailWarning, PenLine, RotateCw, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AIError, callAI, toTranscript } from "@/lib/ai-client";
import { allowedConversations, retrieve, ruleAnswer, type AssistantData } from "@/lib/intelligence/assistant";
import { buildBriefing, type BriefingItem } from "@/lib/intelligence/briefing";
import { PLATFORMS } from "@/lib/platforms";
import { inboxHref } from "@/lib/routes";
import type { Conversation } from "@/lib/types";
import { useServerStatus } from "@/lib/use-connectors";
import { cn, formatDue, formatListTime } from "@/lib/utils";
import { useNow, usePriorityContext } from "@/store/selectors";
import { useWorkspace } from "@/store/workspace";
import { PlatformIcon } from "../brand/platform-icon";
import { PageHeader } from "../shell/page-header";
import { Button, Spinner } from "../ui/button";
import { EmptyState } from "../ui/empty";

const EXAMPLES = [
  "What important messages did I miss today?",
  "Which emails require my attention?",
  "Show all conversations with Rahul",
  "Summarize my discussions with Halcyon Health",
  "Who am I waiting for a response from?",
  "Draft a follow-up to someone I contacted last week",
];

interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  conversationIds?: string[];
  draft?: { conversationId: string; text: string } | null;
  source?: "ai" | "rules";
  error?: boolean;
}

export function AssistantView() {
  const conversations = useWorkspace((s) => s.conversations);
  const messages = useWorkspace((s) => s.messages);
  const contacts = useWorkspace((s) => s.contacts);
  const accounts = useWorkspace((s) => s.accounts);
  const reminders = useWorkspace((s) => s.reminders);
  const aiPref = useWorkspace((s) => s.prefs.aiEnabled);
  const priorityCtx = usePriorityContext();
  const now = useNow();
  const { status } = useServerStatus();
  const aiAvailable = !!status?.backend.ai && aiPref;

  const data: AssistantData = useMemo(() => ({ conversations, messages, contacts, accounts, reminders, priorityCtx, now }), [conversations, messages, contacts, accounts, reminders, priorityCtx, now]);
  const briefing = useMemo(
    () => buildBriefing({ conversations, messages, reminders, contacts, accounts, priorityCtx, now }),
    [conversations, messages, reminders, contacts, accounts, priorityCtx, now],
  );

  if (accounts.length === 0) {
    return (
      <div className="flex h-full flex-col bg-bg">
        <PageHeader title="Assistant" />
        <EmptyState icon={<Sparkles />} title="Nothing to brief yet" description="Connect an account and the assistant will summarize what needs your attention." />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <PageHeader
        title="Assistant"
        description={aiAvailable ? "Briefings, answers and drafts from your conversations" : "Rule-based briefing. Add an Anthropic API key to enable AI answers and drafts."}
      />
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto grid max-w-[1120px] gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[1fr_400px]">
          <Chat data={data} aiAvailable={aiAvailable} aiPref={aiPref} />
          <BriefingPanel briefing={briefing} data={data} aiAvailable={aiAvailable} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ chat */

function Chat({ data, aiAvailable, aiPref }: { data: AssistantData; aiAvailable: boolean; aiPref: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    const userTurn: Turn = { id: `u${Date.now()}`, role: "user", text: question };
    setTurns((t) => [...t, userTurn]);
    setBusy(true);
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    try {
      if (aiAvailable) {
        const convs = retrieve(question, data);
        const transcripts = convs.map((c) => toTranscript(c, data.messages[c.id] ?? [], data.accounts.find((a) => a.id === c.accountId), 40));
        const rules = ruleAnswer(question, data);
        const history = turns.slice(-6).map((t) => ({ role: t.role, text: t.text.slice(0, 2000) }));
        const r = await callAI<{ answer: string; citedConversationIds: string[]; draft: { conversationId: string; text: string } | null }>({
          action: "ask",
          question,
          transcripts,
          signals: { ruleBasedFindings: rules.text },
          history,
        });
        const valid = new Set(convs.map((c) => c.id));
        setTurns((t) => [
          ...t,
          {
            id: `a${Date.now()}`,
            role: "assistant",
            text: r.answer,
            conversationIds: r.citedConversationIds.filter((id) => valid.has(id)),
            draft: r.draft && valid.has(r.draft.conversationId) ? r.draft : null,
            source: "ai",
          },
        ]);
      } else {
        const r = ruleAnswer(question, data);
        setTurns((t) => [...t, { id: `a${Date.now()}`, role: "assistant", text: r.text, conversationIds: r.conversationIds, source: "rules" }]);
      }
    } catch (e) {
      setTurns((t) => [...t, { id: `a${Date.now()}`, role: "assistant", text: e instanceof AIError ? e.message : "Something went wrong.", error: true }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    }
  };

  return (
    <section className="flex min-h-[520px] flex-col rounded-xl border border-line bg-surface shadow-sm" aria-label="Ask Orbit">
      <div className="flex items-center gap-2 border-b border-line-subtle px-4 py-3">
        <span className="inline-flex size-7 items-center justify-center rounded-[8px] bg-accent-soft text-accent-text">
          <Sparkles className="size-4" />
        </span>
        <div>
          <h2 className="text-[0.875rem] font-semibold">Ask Orbit</h2>
          <p className="text-[0.6875rem] text-fg-3">
            {aiAvailable ? `Reads only accounts with AI access (${allowedConversations(data).length} conversations). Never sends anything.` : aiPref ? "AI isn't configured. Answering common questions with rules." : "AI is turned off in Settings. Answering with rules."}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 scrollbar-thin">
        {turns.length === 0 ? (
          <div className="py-4">
            <p className="text-[0.8125rem] text-fg-3">Try one of these:</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => void ask(e)} className="rounded-full border border-line px-3 py-1.5 text-left text-xs text-fg-2 transition-colors hover:border-accent hover:bg-accent-soft hover:text-fg">
                  {e}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {turns.map((t) =>
          t.role === "user" ? (
            <div key={t.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-[16px] rounded-br-[6px] bg-fg px-3.5 py-2 text-[0.8125rem] text-fg-inverse">{t.text}</p>
            </div>
          ) : (
            <AssistantTurn key={t.id} turn={t} data={data} />
          ),
        )}
        {busy ? (
          <div className="flex items-center gap-2 text-xs text-fg-3">
            <Spinner /> {aiAvailable ? "Reading your conversations…" : "Looking…"}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-line-subtle p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-lg border border-line bg-surface px-3 py-2 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-soft">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(input);
              }
            }}
            rows={1}
            placeholder="Ask about your conversations…"
            aria-label="Ask Orbit"
            className="max-h-32 min-h-6 flex-1 resize-none bg-transparent text-[0.875rem] leading-6 outline-none placeholder:text-fg-4"
          />
          <button type="submit" disabled={!input.trim() || busy} aria-label="Ask" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast transition-opacity disabled:opacity-40">
            <ArrowUp className="size-4" />
          </button>
        </div>
      </form>
    </section>
  );
}

function AssistantTurn({ turn, data }: { turn: Turn; data: AssistantData }) {
  const router = useRouter();
  const saveDraft = useWorkspace((s) => s.saveDraft);
  const convs = (turn.conversationIds ?? []).map((id) => data.conversations.find((c) => c.id === id)).filter(Boolean) as Conversation[];
  const draftConv = turn.draft ? data.conversations.find((c) => c.id === turn.draft!.conversationId) : undefined;
  return (
    <div className="max-w-[95%] animate-slide-up">
      <div className={cn("whitespace-pre-wrap text-[0.875rem] leading-6", turn.error ? "text-danger" : "text-fg")}>{turn.text}</div>
      {convs.length ? (
        <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
          {convs.slice(0, 6).map((c) => (
            <ConvCard key={c.id} c={c} data={data} />
          ))}
        </div>
      ) : null}
      {turn.draft && draftConv ? (
        <div className="mt-3 rounded-lg border border-line bg-surface-sunken p-3">
          <div className="mb-1.5 flex items-center gap-2 text-xs">
            <PenLine className="size-3.5 text-accent-text" />
            <span className="font-semibold">Draft for {draftConv.kind === "email" ? draftConv.participants[0]?.name : draftConv.title}</span>
            <span className="text-fg-4">· not sent</span>
          </div>
          <p className="whitespace-pre-wrap text-[0.8125rem] leading-5 text-fg-2">{turn.draft.text}</p>
          <Button
            size="xs"
            variant="primary"
            className="mt-2.5"
            onClick={() => {
              const existing = useWorkspace.getState().drafts.find((d) => d.conversationId === draftConv.id);
              saveDraft({ id: existing?.id, accountId: draftConv.accountId, conversationId: draftConv.id, to: draftConv.participants.map((p) => p.handle ?? p.name), body: turn.draft!.text });
              toast("Draft placed in the conversation", { description: "Review and send it from the composer." });
              router.push(inboxHref({ c: draftConv.id }));
            }}
          >
            Open draft in conversation
          </Button>
        </div>
      ) : null}
      <p className="mt-1.5 text-[0.6875rem] text-fg-4">{turn.source === "ai" ? "Answered by AI from the conversations shown" : turn.source === "rules" ? "Answered with Orbit's rules (no AI)" : ""}</p>
    </div>
  );
}

function ConvCard({ c, data }: { c: Conversation; data: AssistantData }) {
  const acc = data.accounts.find((a) => a.id === c.accountId);
  return (
    <Link href={inboxHref({ c: c.id })} className="flex items-start gap-2.5 rounded-md border border-line bg-surface px-3 py-2 transition-colors hover:border-line-strong hover:bg-hover">
      <PlatformIcon platform={c.platform} size={16} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-xs font-semibold">{c.kind === "channel" ? `#${c.title}` : c.kind === "email" ? c.participants[0]?.name : c.title}</span>
          <span className="ml-auto shrink-0 text-[0.625rem] text-fg-4">{formatListTime(c.lastMessageAt)}</span>
        </span>
        <span className="block truncate text-[0.6875rem] text-fg-3">
          {c.kind === "email" ? c.title : c.preview}
        </span>
        <span className="block text-[0.625rem] text-fg-4">
          {PLATFORMS[c.platform].shortName} · {acc?.label}
        </span>
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ briefing */

function BriefingPanel({ briefing, data, aiAvailable }: { briefing: ReturnType<typeof buildBriefing>; data: AssistantData; aiAvailable: boolean }) {
  const [ai, setAi] = useState<{ headline: string; bullets: { text: string; conversationId: string }[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const byId = (id: string) => data.conversations.find((c) => c.id === id);

  const generate = async () => {
    setLoading(true);
    try {
      const ids = Array.from(
        new Set([...briefing.urgent, ...briefing.importantUnread, ...briefing.needsResponse, ...briefing.unansweredProfessional].map((i) => i.conversationId)),
      ).slice(0, 10);
      const transcripts = ids.map((id) => byId(id)).filter(Boolean).map((c) => toTranscript(c!, data.messages[c!.id] ?? [], data.accounts.find((a) => a.id === c!.accountId), 12));
      const strip = (xs: BriefingItem[]) => xs.slice(0, 8).map((i) => ({ conversationId: i.conversationId, title: i.title, detail: i.detail }));
      const r = await callAI<{ headline: string; bullets: { text: string; conversationId: string }[] }>({
        action: "briefing",
        sections: {
          urgent: strip(briefing.urgent),
          importantUnread: strip(briefing.importantUnread),
          needsResponse: strip(briefing.needsResponse),
          unansweredProfessional: strip(briefing.unansweredProfessional),
          yesterday: strip(briefing.yesterday),
          followUpsDue: briefing.pendingFollowUps.slice(0, 8).map((f) => ({ conversationId: f.reminder.conversationId ?? "", title: f.reminder.title, detail: f.overdue ? "overdue" : `due ${formatDue(f.reminder.dueAt!)}` })),
        },
        transcripts,
      });
      setAi(r);
    } catch (e) {
      toast.error("Couldn't write the briefing", { description: e instanceof AIError ? e.message : undefined });
    } finally {
      setLoading(false);
    }
  };

  const sections: { title: string; icon: React.ReactNode; items: BriefingItem[]; empty: string }[] = [
    { title: "Urgent", icon: <CalendarClock />, items: briefing.urgent, empty: "No deadlines in the next 3 days" },
    { title: "Important & unread", icon: <Zap />, items: briefing.importantUnread, empty: "Nothing important unread" },
    { title: "Emails needing a reply", icon: <MailWarning />, items: briefing.needsResponse, empty: "No emails waiting on you" },
    { title: "Unanswered work chats", icon: <Hourglass />, items: briefing.unansweredProfessional, empty: "All caught up" },
  ];

  return (
    <aside className="space-y-4" aria-label="Daily briefing">
      <section className="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-fg-4">{format(new Date(data.now), "EEEE, MMMM d")}</p>
            <h2 className="mt-0.5 text-[1rem] font-semibold tracking-[-0.015em]">Daily briefing</h2>
          </div>
          {aiAvailable ? (
            <Button size="xs" variant="secondary" onClick={generate} loading={loading}>
              {!loading ? ai ? <RotateCw /> : <Sparkles /> : null} {ai ? "Rewrite" : "Write with AI"}
            </Button>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-fg-3">
          {briefing.stats.unread} unread across {briefing.stats.accounts} accounts · {briefing.pendingFollowUps.length} follow-up{briefing.pendingFollowUps.length === 1 ? "" : "s"} due
        </p>
        {ai ? (
          <div className="mt-3 rounded-lg bg-accent-soft/60 p-3 animate-fade-in">
            <p className="text-[0.8125rem] font-medium text-fg">{ai.headline}</p>
            <ul className="mt-2 space-y-1.5">
              {ai.bullets.map((b, i) => {
                const c = b.conversationId ? byId(b.conversationId) : undefined;
                return (
                  <li key={i} className="flex gap-2 text-[0.8125rem] leading-5 text-fg-2">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-accent" />
                    {c ? (
                      <Link href={inboxHref({ c: c.id })} className="hover:text-fg hover:underline">
                        {b.text}
                      </Link>
                    ) : (
                      <span>{b.text}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[0.625rem] text-fg-4">Written by AI from the signals below.</p>
          </div>
        ) : null}
      </section>

      {sections.map((s) => (
        <section key={s.title} className="rounded-xl border border-line bg-surface shadow-xs">
          <h3 className="flex items-center gap-2 border-b border-line-subtle px-4 py-2.5 text-xs font-semibold [&_svg]:size-3.5 [&_svg]:text-fg-3">
            {s.icon} {s.title}
            <span className="ml-auto font-normal text-fg-4">{s.items.length}</span>
          </h3>
          {s.items.length === 0 ? (
            <p className="px-4 py-3 text-xs text-fg-4">{s.empty}</p>
          ) : (
            <ul>
              {s.items.slice(0, 5).map((i) => {
                const c = byId(i.conversationId);
                return (
                  <li key={i.conversationId}>
                    <Link href={inboxHref({ c: i.conversationId })} className="flex items-start gap-2.5 border-b border-line-subtle px-4 py-2.5 last:border-b-0 hover:bg-hover">
                      {c ? <PlatformIcon platform={c.platform} size={14} className="mt-0.5" /> : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-fg">{i.title}</span>
                        <span className="block truncate text-[0.6875rem] text-fg-3">{i.detail}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}

      {briefing.pendingFollowUps.length ? (
        <section className="rounded-xl border border-line bg-surface shadow-xs">
          <h3 className="flex items-center gap-2 border-b border-line-subtle px-4 py-2.5 text-xs font-semibold">
            <AlarmClock className="size-3.5 text-fg-3" /> Follow-ups due
            <Link href="/follow-ups" className="ml-auto font-normal text-fg-3 hover:text-fg">
              View all
            </Link>
          </h3>
          <ul>
            {briefing.pendingFollowUps.slice(0, 5).map(({ reminder: r, overdue }) => (
              <li key={r.id} className="flex items-center gap-2 border-b border-line-subtle px-4 py-2.5 text-xs last:border-b-0">
                <span className={cn("size-1.5 shrink-0 rounded-full", overdue ? "bg-danger" : "bg-warning")} />
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                <span className={cn("shrink-0", overdue ? "font-medium text-danger" : "text-fg-3")}>{overdue ? "Overdue" : formatDue(r.dueAt!)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="flex gap-2 px-1 text-[0.6875rem] leading-4 text-fg-4">
        <Info className="mt-px size-3 shrink-0" /> The briefing is built from rules you can inspect: deadlines, VIPs, mentions, direct questions and reminders. AI only rewrites it into prose when you ask.
      </p>
    </aside>
  );
}
