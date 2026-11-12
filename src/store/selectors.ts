"use client";

import { useMemo, useSyncExternalStore } from "react";
import { capabilitiesFor } from "@/lib/platforms";
import { scoreConversation, type PriorityContext } from "@/lib/intelligence/priority";
import type { Account, Capabilities, Conversation, FolderView, QuickFilter, SortMode } from "@/lib/types";
import { DEMO_USER } from "@/lib/demo/seed";
import { useWorkspace } from "./workspace";

/** A clock that ticks every 30s so snoozes and "time ago" labels stay fresh. */
let nowValue = Date.now();
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  setInterval(() => {
    nowValue = Date.now();
    listeners.forEach((l) => l());
  }, 30_000);
}
export function useNow(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => nowValue,
    () => nowValue,
  );
}

export function usePriorityContext(): PriorityContext {
  const contacts = useWorkspace((s) => s.contacts);
  const accounts = useWorkspace((s) => s.accounts);
  const rules = useWorkspace((s) => s.priorityRules);
  return useMemo(
    () => ({
      contacts: new Map(contacts.map((c) => [c.id, c])),
      accounts: new Map(accounts.map((a) => [a.id, a])),
      rules,
      selfNames: [DEMO_USER.name.split(" ")[0].toLowerCase(), "me"],
    }),
    [contacts, accounts, rules],
  );
}

/** Conversations with priority computed from the current rules. */
export function useEnrichedConversations(): Conversation[] {
  const conversations = useWorkspace((s) => s.conversations);
  const messages = useWorkspace((s) => s.messages);
  const ctx = usePriorityContext();
  return useMemo(
    () =>
      conversations.map((c) => {
        const r = scoreConversation(c, messages[c.id] ?? [], ctx);
        return { ...c, priority: r.priority, priorityReasons: r.reasons };
      }),
    [conversations, messages, ctx],
  );
}

export interface ListQuery {
  folder: FolderView;
  accountId?: string;
  labelId?: string;
  filter: QuickFilter;
  sort: SortMode;
  /** Conversation ids where the user has sent a message (for the Sent folder). */
  sentIds?: Set<string>;
}

export function isSnoozed(c: Conversation, now: number) {
  return !!c.snoozedUntil && new Date(c.snoozedUntil).getTime() > now;
}

export function filterConversations(all: Conversation[], q: ListQuery, now: number): Conversation[] {
  let list = all;

  if (q.accountId) list = list.filter((c) => c.accountId === q.accountId);
  if (q.labelId) list = list.filter((c) => c.labels.includes(q.labelId!));

  switch (q.folder) {
    case "all":
      list = list.filter((c) => !c.archived && !isSnoozed(c, now));
      break;
    case "unread":
      list = list.filter((c) => !c.archived && c.unreadCount > 0 && !isSnoozed(c, now));
      break;
    case "starred":
      list = list.filter((c) => c.starred);
      break;
    case "important":
      list = list.filter((c) => !c.archived && (c.important || c.priority === "high"));
      break;
    case "archived":
      list = list.filter((c) => c.archived);
      break;
    case "sent":
      list = list.filter((c) => q.sentIds?.has(c.id));
      break;
    default:
      break;
  }

  switch (q.filter) {
    case "unread":
      list = list.filter((c) => c.unreadCount > 0);
      break;
    case "starred":
      list = list.filter((c) => c.starred);
      break;
    case "priority":
      list = list.filter((c) => c.priority === "high");
      break;
    case "personal":
    case "professional":
    case "work":
      list = list.filter((c) => c.category === q.filter);
      break;
  }

  const byRecent = (a: Conversation, b: Conversation) => b.lastMessageAt.localeCompare(a.lastMessageAt);
  const prioRank = { high: 0, normal: 1, low: 2 } as const;
  const sorted = [...list];
  switch (q.sort) {
    case "recent":
      sorted.sort(byRecent);
      break;
    case "oldest":
      sorted.sort((a, b) => -byRecent(a, b));
      break;
    case "unread":
      sorted.sort((a, b) => Number(b.unreadCount > 0) - Number(a.unreadCount > 0) || byRecent(a, b));
      break;
    case "priority":
      sorted.sort((a, b) => prioRank[a.priority] - prioRank[b.priority] || byRecent(a, b));
      break;
    case "platform":
      sorted.sort((a, b) => a.platform.localeCompare(b.platform) || a.accountId.localeCompare(b.accountId) || byRecent(a, b));
      break;
  }
  // Pinned conversations float to the top in inbox-like views.
  if (q.folder === "all" || q.folder === "unread") sorted.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  return sorted;
}

/** Messages "sent" view: conversations where you've sent at least one message. */
export function useSentConversationIds(): Set<string> {
  const messages = useWorkspace((s) => s.messages);
  return useMemo(() => new Set(Object.entries(messages).filter(([, ms]) => ms.some((m) => m.authorId === "me")).map(([k]) => k)), [messages]);
}

export function accountCapabilities(account: Account | undefined): Capabilities {
  if (!account) return capabilitiesFor("gmail", { send: false, reply: false, compose: false });
  return capabilitiesFor(account.platform, account.capabilityOverrides);
}

export function useAccount(id: string | undefined): Account | undefined {
  return useWorkspace((s) => (id ? s.accounts.find((a) => a.id === id) : undefined));
}

export function useUnreadByAccount(): Record<string, number> {
  const conversations = useWorkspace((s) => s.conversations);
  const now = useNow();
  return useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of conversations) {
      if (c.archived || c.unreadCount === 0 || isSnoozed(c, now)) continue;
      out[c.accountId] = (out[c.accountId] ?? 0) + 1;
    }
    return out;
  }, [conversations, now]);
}
