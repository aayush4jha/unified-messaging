/**
 * Daily communication briefing, assembled deterministically from synced data.
 * The AI layer can rewrite this into prose, but every item here is traceable
 * to a real conversation; nothing is invented.
 */
import type { Account, Contact, Conversation, Message, Reminder } from "../types";
import { detectFollowUps, type FollowUpSuggestion } from "./followups";
import { scoreConversation, type PriorityContext } from "./priority";
import { findDeadline, lastInbound, looksAutomated } from "./signals";

export interface BriefingItem {
  conversationId: string;
  title: string;
  detail: string;
  at: string;
}

export interface Briefing {
  generatedAt: string;
  importantUnread: BriefingItem[];
  needsResponse: BriefingItem[];
  unansweredProfessional: BriefingItem[];
  yesterday: BriefingItem[];
  pendingFollowUps: { reminder: Reminder; overdue: boolean }[];
  urgent: BriefingItem[];
  waitingOnOthers: FollowUpSuggestion[];
  stats: { unread: number; conversations: number; accounts: number };
}

export function buildBriefing(input: {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  reminders: Reminder[];
  contacts: Contact[];
  accounts: Account[];
  priorityCtx: PriorityContext;
  now?: number;
}): Briefing {
  const now = input.now ?? Date.now();
  const allowed = new Set(input.accounts.filter((a) => a.aiEnabled).map((a) => a.id));
  const convs = input.conversations.filter((c) => !c.archived && allowed.has(c.accountId));
  const item = (c: Conversation, detail?: string): BriefingItem => ({
    conversationId: c.id,
    title: c.kind === "email" ? `${senderName(c)} — ${c.title}` : c.kind === "channel" ? `#${c.title}` : c.title,
    detail: detail ?? c.preview,
    at: c.lastMessageAt,
  });

  const scored = convs.map((c) => ({ c, r: scoreConversation(c, input.messages[c.id] ?? [], input.priorityCtx) }));

  const importantUnread = scored
    .filter(({ c, r }) => c.unreadCount > 0 && (r.priority === "high" || c.important))
    .map(({ c, r }) => item(c, r.reasons.slice(0, 2).join(" · ") || c.preview));

  const followUps = detectFollowUps(convs, input.messages, now);
  const needsResponse = followUps
    .filter((f) => f.type === "needs_reply")
    .map((f) => {
      const c = convs.find((x) => x.id === f.conversationId)!;
      return item(c, f.reason);
    })
    .filter((i) => convs.find((c) => c.id === i.conversationId)?.kind === "email");

  const unansweredProfessional = followUps
    .filter((f) => f.type === "needs_reply")
    .map((f) => convs.find((x) => x.id === f.conversationId)!)
    .filter((c) => c.kind !== "email" && (c.category === "professional" || c.category === "work"))
    .map((c) => item(c));

  const yStart = new Date(now);
  yStart.setDate(yStart.getDate() - 1);
  yStart.setHours(0, 0, 0, 0);
  const yEnd = new Date(yStart);
  yEnd.setHours(23, 59, 59, 999);
  const yesterday = scored
    .filter(({ c, r }) => {
      const msgs = input.messages[c.id] ?? [];
      return (
        r.priority !== "low" &&
        msgs.some((m) => {
          const t = new Date(m.sentAt).getTime();
          return t >= yStart.getTime() && t <= yEnd.getTime();
        })
      );
    })
    .map(({ c }) => item(c));

  const urgent: BriefingItem[] = [];
  for (const c of convs) {
    const inbound = lastInbound(input.messages[c.id] ?? []);
    if (!inbound || looksAutomated(inbound.body, undefined, c.title)) continue;
    const d = findDeadline(inbound.body, inbound.sentAt);
    if (d) {
      const due = new Date(d.dueAt).getTime();
      if (due > now - 12 * 3_600_000 && due < now + 72 * 3_600_000) urgent.push(item(c, `Due ${d.phrase.replace(/^by /, "")}`));
    }
  }

  const pendingFollowUps = input.reminders
    .filter((r) => !r.completedAt && r.dueAt && new Date(r.dueAt).getTime() < now + 24 * 3_600_000)
    .map((r) => ({ reminder: r, overdue: new Date(r.dueAt!).getTime() < now }))
    .sort((a, b) => a.reminder.dueAt!.localeCompare(b.reminder.dueAt!));

  return {
    generatedAt: new Date(now).toISOString(),
    importantUnread,
    needsResponse,
    unansweredProfessional,
    yesterday,
    pendingFollowUps,
    urgent,
    waitingOnOthers: followUps.filter((f) => f.type === "awaiting_them"),
    stats: {
      unread: convs.reduce((n, c) => n + (c.unreadCount > 0 ? 1 : 0), 0),
      conversations: convs.length,
      accounts: input.accounts.length,
    },
  };
}

function senderName(c: Conversation): string {
  return c.participants[0]?.name ?? c.title;
}
