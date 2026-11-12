/**
 * Follow-up intelligence: finds conversations where someone is waiting on
 * you, you're waiting on someone, or a commitment / deadline was made.
 * Suggestions only — Orbit never sends anything on its own.
 */
import type { Conversation, Message } from "../types";
import { findDeadline, isCommitment, isRequest, lastInbound, lastOutbound, looksAutomated } from "./signals";

export type FollowUpType = "needs_reply" | "awaiting_them" | "your_commitment" | "their_deadline";

export interface FollowUpSuggestion {
  id: string;
  type: FollowUpType;
  conversationId: string;
  title: string;
  reason: string;
  since: string;
  dueAt?: string;
}

const HOUR = 3_600_000;

export function detectFollowUps(
  conversations: Conversation[],
  messagesByConv: Record<string, Message[]>,
  now = Date.now(),
): FollowUpSuggestion[] {
  const out: FollowUpSuggestion[] = [];

  for (const conv of conversations) {
    if (conv.archived || conv.muted) continue;
    const msgs = messagesByConv[conv.id] ?? [];
    if (msgs.length === 0) continue;
    const last = msgs[msgs.length - 1];
    const inbound = lastInbound(msgs);
    const outbound = lastOutbound(msgs);
    const sender = inbound ? conv.participants.find((p) => p.id === inbound.authorId) : undefined;
    const who = sender?.name ?? conv.title;
    const automated = inbound ? looksAutomated(inbound.body, sender?.handle, conv.title) : false;
    const age = now - new Date(last.sentAt).getTime();

    // Someone is waiting on you
    if (last.authorId !== "me" && inbound && !automated && isRequest(inbound.body) && conv.kind !== "channel") {
      out.push({
        id: `fu_reply_${conv.id}`,
        type: "needs_reply",
        conversationId: conv.id,
        title: `Reply to ${who}`,
        reason: age > 24 * HOUR ? `Unanswered for ${Math.round(age / (24 * HOUR))} days` : "Asked you something",
        since: inbound.sentAt,
      });
    }

    // You're waiting on them
    if (last.authorId === "me" && isRequest(last.body) && age > 48 * HOUR) {
      out.push({
        id: `fu_wait_${conv.id}`,
        type: "awaiting_them",
        conversationId: conv.id,
        title: `Waiting on ${conv.participants[0]?.name ?? conv.title}`,
        reason: `No response for ${Math.round(age / (24 * HOUR))} days`,
        since: last.sentAt,
      });
    }

    // Commitments you made that haven't been followed by another message from you
    if (outbound && isCommitment(outbound.body)) {
      const deadline = findDeadline(outbound.body, outbound.sentAt);
      if (deadline && new Date(deadline.dueAt).getTime() > now - 3 * 24 * HOUR) {
        out.push({
          id: `fu_commit_${conv.id}`,
          type: "your_commitment",
          conversationId: conv.id,
          title: `You promised: “${truncateSentence(outbound.body)}”`,
          reason: `Due ${deadline.phrase.replace(/^by /, "")}`,
          since: outbound.sentAt,
          dueAt: deadline.dueAt,
        });
      }
    }

    // Deadlines someone gave you
    if (inbound && !automated) {
      const deadline = findDeadline(inbound.body, inbound.sentAt);
      if (deadline && new Date(deadline.dueAt).getTime() > now - 24 * HOUR) {
        out.push({
          id: `fu_deadline_${conv.id}`,
          type: "their_deadline",
          conversationId: conv.id,
          title: `${who} needs something ${deadline.phrase}`,
          reason: truncateSentence(sentenceContaining(inbound.body, deadline.phrase)),
          since: inbound.sentAt,
          dueAt: deadline.dueAt,
        });
      }
    }
  }

  return out.sort((a, b) => (a.dueAt ?? a.since).localeCompare(b.dueAt ?? b.since));
}

function sentenceContaining(body: string, phrase: string): string {
  const sentences = body.replace(/\n+/g, " ").split(/(?<=[.!?])\s+/);
  return sentences.find((s) => s.toLowerCase().includes(phrase.toLowerCase())) ?? sentences[0] ?? body;
}

function truncateSentence(s: string, max = 90): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}
