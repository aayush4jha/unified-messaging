"use client";

import { format } from "date-fns";
import { BellPlus, CalendarClock, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { findDeadline, isRequest, lastInbound, looksAutomated } from "@/lib/intelligence/signals";
import type { Conversation, Message } from "@/lib/types";
import { useNow } from "@/store/selectors";
import { useWorkspace } from "@/store/workspace";
import { Button } from "../ui/button";
import { AIPanel } from "../assistant/ai-panel";

/**
 * Contextual strip above the thread: detected deadlines/requests (rule-based,
 * always available) and the AI summary + smart replies (when enabled).
 */
export function ConversationInsights({ conversation: c, messages, onUseReply }: { conversation: Conversation; messages: Message[]; onUseReply: (text: string) => void }) {
  const reminders = useWorkspace((s) => s.reminders);
  const addReminder = useWorkspace((s) => s.addReminder);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const now = useNow();

  const signal = useMemo(() => {
    const inbound = lastInbound(messages);
    if (!inbound || looksAutomated(inbound.body, undefined, c.title)) return null;
    const deadline = findDeadline(inbound.body, inbound.sentAt);
    if (deadline && new Date(deadline.dueAt).getTime() > now - 86_400_000) {
      const sentence = inbound.body.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).find((s) => s.toLowerCase().includes(deadline.phrase)) ?? inbound.body;
      return { key: `${inbound.id}:deadline`, kind: "deadline" as const, text: sentence.trim(), due: new Date(deadline.dueAt), phrase: deadline.phrase };
    }
    return null;
  }, [messages, c.title, now]);

  const hasReminder = reminders.some((r) => r.conversationId === c.id && !r.completedAt);
  const showSignal = signal && dismissed !== signal.key && !hasReminder;
  const last = messages[messages.length - 1];
  const needsReply = last && last.authorId !== "me" && isRequest(last.body);

  return (
    <div className="mx-auto w-full max-w-[780px] px-4 pt-4 sm:px-8 empty:hidden">
      {showSignal ? (
        <div className="mb-3 flex items-start gap-3 rounded-lg border border-line bg-surface px-3.5 py-3 shadow-xs animate-slide-up">
          <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-warning-soft text-[color-mix(in_oklch,var(--warning)_75%,var(--text))]">
            <CalendarClock className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.8125rem] font-medium text-fg">Deadline detected: due {format(signal.due, "EEEE, MMM d")}</p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-[1.125rem] text-fg-3">“{signal.text}”</p>
            <div className="mt-2 flex gap-1.5">
              <Button
                size="xs"
                variant="secondary"
                onClick={() => {
                  const due = new Date(signal.due.getTime() - 3 * 3_600_000);
                  addReminder({
                    kind: "follow_up",
                    title: `Respond to ${c.participants[0]?.name.split(" ")[0] ?? c.title}: ${signal.phrase}`,
                    conversationId: c.id,
                    contactId: c.contactId,
                    dueAt: due.toISOString(),
                    source: "suggestion",
                  });
                  toast("Reminder added", { description: `${format(due, "EEE, MMM d 'at' h:mm a")} · 3 hours before the deadline` });
                }}
              >
                <BellPlus /> Remind me before it&apos;s due
              </Button>
            </div>
          </div>
          <button aria-label="Dismiss" className="rounded-[4px] p-0.5 text-fg-4 hover:bg-hover hover:text-fg-2" onClick={() => setDismissed(signal.key)}>
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
      <AIPanel conversation={c} messages={messages} needsReply={!!needsReply} onUseReply={onUseReply} />
    </div>
  );
}
