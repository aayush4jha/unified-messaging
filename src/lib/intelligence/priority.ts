/**
 * Smart prioritization — transparent, rule-based scoring.
 *
 * Every point added or removed records a human-readable reason, which the UI
 * shows on hover ("Why is this high priority?"). Users control the rules in
 * Settings → Priority.
 */
import type { Account, Contact, Conversation, Message, Priority, PriorityRule } from "../types";
import { isRequest, isUrgent, lastInbound, looksAutomated, mentionsSelf, findDeadline } from "./signals";

export interface PriorityContext {
  contacts: Map<string, Contact>;
  accounts: Map<string, Account>;
  rules: PriorityRule[];
  selfNames: string[];
  now?: number;
}

export interface PriorityResult {
  priority: Priority;
  score: number;
  reasons: string[];
}

export function scoreConversation(conv: Conversation, messages: Message[], ctx: PriorityContext): PriorityResult {
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };

  const inbound = lastInbound(messages);
  const last = messages[messages.length - 1];
  const contact = conv.contactId ? ctx.contacts.get(conv.contactId) : undefined;
  const sender = inbound ? conv.participants.find((p) => p.id === inbound.authorId) : undefined;
  const now = ctx.now ?? Date.now();

  if (conv.important) add(2, "Marked important");
  if (contact?.vip) add(3, `${contact.name} is a VIP`);

  if (inbound) {
    if (mentionsSelf(inbound.body, ctx.selfNames)) add(3, "You were mentioned");
    if (isUrgent(inbound.body)) add(1, "Uses urgent language");
    const deadline = findDeadline(inbound.body, inbound.sentAt);
    if (deadline && new Date(deadline.dueAt).getTime() > now - 86_400_000) add(2, `Deadline: “${deadline.phrase}”`);
    if (last?.authorId !== "me" && isRequest(inbound.body) && !looksAutomated(inbound.body, sender?.handle, conv.title))
      add(1, "Waiting on your reply");
    if (looksAutomated(inbound.body, sender?.handle, conv.title)) add(-3, "Looks automated");
  }

  if (conv.muted) add(-3, "Muted");
  if ((conv.kind === "channel" || conv.kind === "group") && !reasons.includes("You were mentioned")) add(-1, "Group conversation");

  const text = `${conv.title}\n${inbound?.body ?? ""}`.toLowerCase();
  for (const rule of ctx.rules) {
    if (!rule.enabled || !rule.value.trim()) continue;
    const v = rule.value.trim().toLowerCase();
    let hit = false;
    if (rule.kind === "keyword") hit = text.includes(v);
    if (rule.kind === "sender")
      hit =
        conv.participants.some((p) => p.name.toLowerCase().includes(v) || p.handle?.toLowerCase().includes(v)) ||
        !!contact?.emails.some((e) => e.toLowerCase().includes(v));
    if (rule.kind === "account") hit = conv.accountId === rule.value || ctx.accounts.get(conv.accountId)?.label.toLowerCase() === v;
    if (rule.kind === "platform") hit = conv.platform === v;
    if (hit) add(rule.effect === "boost" ? 3 : -3, `Rule: ${rule.kind} “${rule.value}”`);
  }

  const priority: Priority = score >= 3 ? "high" : score <= -2 ? "low" : "normal";
  return { priority, score, reasons };
}

export const DEFAULT_PRIORITY_RULES: PriorityRule[] = [
  { id: "rule_deadline", kind: "keyword", value: "deadline", effect: "boost", enabled: true },
  { id: "rule_interview", kind: "keyword", value: "interview", effect: "boost", enabled: true },
  { id: "rule_offer", kind: "keyword", value: "offer letter", effect: "boost", enabled: true },
  { id: "rule_promo", kind: "keyword", value: "% off", effect: "lower", enabled: true },
];
