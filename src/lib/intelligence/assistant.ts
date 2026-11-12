/**
 * Retrieval + rule-based intents for the Orbit assistant.
 *
 * With AI configured, `retrieve` picks the conversations the model is allowed
 * to read for a question (only AI-enabled accounts). Without AI, `ruleAnswer`
 * answers the common intents deterministically and says so.
 */
import { differenceInCalendarDays } from "date-fns";
import { PLATFORMS } from "../platforms";
import { parseQuery, runSearch } from "../search";
import type { Account, Contact, Conversation, Message, Reminder } from "../types";
import { buildBriefing } from "./briefing";
import { detectFollowUps } from "./followups";
import type { PriorityContext } from "./priority";

export interface AssistantData {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  contacts: Contact[];
  accounts: Account[];
  reminders: Reminder[];
  priorityCtx: PriorityContext;
  now: number;
}

export type Intent = "missed" | "attention" | "waiting" | "with_person" | "summarize" | "draft_followup" | "search";

export function detectIntent(q: string): Intent {
  const s = q.toLowerCase();
  if (/\bdraft\b|\bwrite (a|an)?\s*(follow|reply|message)/.test(s)) return "draft_followup";
  if (/summari[sz]e|recap|tl;?dr/.test(s)) return "summarize";
  if (/waiting (on|for)|who.*(owe|respon|get back)|haven'?t (replied|responded) to me/.test(s)) return "waiting";
  if (/(require|need)s? (my )?(attention|reply|response)|should i (reply|respond)|to reply to/.test(s)) return "attention";
  if (/\bmiss(ed)?\b|important|what'?s (new|urgent)|catch me up|today/.test(s)) return "missed";
  if (/(conversations?|messages?|chats?|threads?) with|talk(ed)? (to|with)|discussions? with/.test(s)) return "with_person";
  return "search";
}

export function allowedConversations(d: AssistantData): Conversation[] {
  const allowed = new Set(d.accounts.filter((a) => a.aiEnabled).map((a) => a.id));
  return d.conversations.filter((c) => allowed.has(c.accountId));
}

/** Choose the conversations relevant to a question (max `limit`). */
export function retrieve(question: string, d: AssistantData, limit = 12): Conversation[] {
  const convs = allowedConversations(d);
  const intent = detectIntent(question);
  const picked = new Map<string, Conversation>();
  const add = (c?: Conversation) => c && picked.size < limit && picked.set(c.id, c);

  const parsed = parseQuery(question, { contacts: d.contacts, accounts: d.accounts, now: new Date(d.now) });
  const hasSignal = parsed.filters.contactIds.length || parsed.filters.platforms.length || parsed.terms.length || parsed.phrases.length || parsed.filters.after;
  if (hasSignal) runSearch(parsed, { conversations: convs, messages: d.messages, contacts: d.contacts }, limit).forEach((h) => add(h.conversation));

  const live = convs.filter((c) => !c.archived);
  const followUps = detectFollowUps(live, d.messages, d.now);
  const byId = (id: string) => convs.find((c) => c.id === id);
  if (intent === "waiting") followUps.filter((f) => f.type === "awaiting_them").forEach((f) => add(byId(f.conversationId)));
  if (intent === "attention" || intent === "missed") followUps.filter((f) => f.type === "needs_reply" || f.type === "their_deadline").forEach((f) => add(byId(f.conversationId)));
  if (intent === "missed") live.filter((c) => c.unreadCount > 0).forEach(add);
  if (intent === "draft_followup") {
    live
      .filter((c) => c.lastAuthorId === "me" && differenceInCalendarDays(d.now, new Date(c.lastMessageAt)) >= 3)
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
      .forEach(add);
  }
  if (picked.size === 0) [...live].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)).slice(0, 8).forEach(add);
  return [...picked.values()];
}

export interface RuleAnswer {
  text: string;
  conversationIds: string[];
  needsAI?: boolean;
}

export function ruleAnswer(question: string, d: AssistantData): RuleAnswer {
  const convs = allowedConversations(d);
  const intent = detectIntent(question);
  const label = (c: Conversation) => {
    const acc = d.accounts.find((a) => a.id === c.accountId);
    const who = c.kind === "channel" ? `#${c.title}` : c.kind === "email" ? `${c.participants[0]?.name ?? ""}: “${c.title}”` : c.title;
    return `${who} (${PLATFORMS[c.platform].shortName} · ${acc?.label ?? ""})`;
  };
  const briefing = buildBriefing({ conversations: convs, messages: d.messages, reminders: d.reminders, contacts: d.contacts, accounts: d.accounts, priorityCtx: d.priorityCtx, now: d.now });
  const followUps = detectFollowUps(convs.filter((c) => !c.archived), d.messages, d.now);
  const byId = (id: string) => convs.find((c) => c.id === id)!;

  switch (intent) {
    case "missed": {
      const items = [...briefing.importantUnread, ...briefing.urgent.filter((u) => !briefing.importantUnread.some((i) => i.conversationId === u.conversationId))];
      if (!items.length) return { text: "Nothing important is waiting. No high-priority unread conversations or near-term deadlines.", conversationIds: [] };
      return {
        text: `${items.length} thing${items.length === 1 ? "" : "s"} worth your attention:\n${items.map((i) => `• ${label(byId(i.conversationId))}: ${i.detail}`).join("\n")}`,
        conversationIds: items.map((i) => i.conversationId),
      };
    }
    case "attention": {
      const emails = followUps.filter((f) => f.type === "needs_reply").map((f) => byId(f.conversationId)).filter((c) => /email/i.test(question) ? c.kind === "email" : true);
      if (!emails.length) return { text: "No conversations are waiting on a reply from you.", conversationIds: [] };
      return { text: `These are waiting on your reply:\n${emails.map((c) => `• ${label(c)}`).join("\n")}`, conversationIds: emails.map((c) => c.id) };
    }
    case "waiting": {
      const waiting = followUps.filter((f) => f.type === "awaiting_them");
      // Only reminders tied to conversations the assistant may read (AI-enabled accounts).
      const allowedIds = new Set(convs.map((c) => c.id));
      const tracked = d.reminders.filter((r) => r.kind === "awaiting_response" && !r.completedAt && r.conversationId && allowedIds.has(r.conversationId));
      const ids = Array.from(new Set([...waiting.map((w) => w.conversationId), ...tracked.map((t) => t.conversationId).filter(Boolean) as string[]]));
      if (!ids.length) return { text: "You're not waiting on anyone right now.", conversationIds: [] };
      return {
        text: `You're waiting on ${ids.length}:\n${ids
          .map((id) => {
            const w = waiting.find((x) => x.conversationId === id);
            const t = tracked.find((x) => x.conversationId === id);
            return `• ${label(byId(id))}: ${w?.reason ?? t?.title ?? ""}`;
          })
          .join("\n")}`,
        conversationIds: ids,
      };
    }
    case "summarize":
    case "draft_followup": {
      const found = retrieve(question, d, 5);
      return {
        text: `${intent === "summarize" ? "Summaries" : "Drafting"} need AI, which isn't configured on this server. Here are the relevant conversations so you can open them directly.`,
        conversationIds: found.map((c) => c.id),
        needsAI: true,
      };
    }
    default: {
      const found = retrieve(question, d, 8);
      if (!found.length) return { text: "I couldn't find matching conversations. Try a person's name, a platform, or a phrase.", conversationIds: [] };
      return { text: `Found ${found.length} matching conversation${found.length === 1 ? "" : "s"}:\n${found.map((c) => `• ${label(c)}`).join("\n")}`, conversationIds: found.map((c) => c.id) };
    }
  }
}
