/**
 * Pure diffing between two workspace snapshots, used to mirror local edits to
 * the live backend. Kept free of I/O so it can be unit-tested.
 */
import type { Account, Contact, Conversation, ConversationNote } from "./types";

export interface Diff<T> {
  upserts: T[];
  deletes: string[];
}

/** Items that are new or changed (by reference), and ids that disappeared. */
export function diffById<T extends { id: string }>(prev: T[], next: T[]): Diff<T> {
  const before = new Map(prev.map((x) => [x.id, x]));
  const after = new Set(next.map((x) => x.id));
  return {
    upserts: next.filter((x) => before.get(x.id) !== x),
    deletes: prev.filter((x) => !after.has(x.id)).map((x) => x.id),
  };
}

export function diffNotes(prev: Record<string, ConversationNote>, next: Record<string, ConversationNote>): Diff<ConversationNote> {
  return {
    upserts: Object.values(next).filter((n) => prev[n.conversationId] !== n),
    deletes: Object.keys(prev).filter((id) => !next[id]),
  };
}

export function conversationPatch(p: Conversation, c: Conversation): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ["starred", "pinned", "important", "archived", "muted"] as const) if (p[k] !== c[k]) out[k] = c[k];
  if (p.snoozedUntil !== c.snoozedUntil) out.snoozedUntil = c.snoozedUntil ?? null;
  if (p.unreadCount > 0 !== c.unreadCount > 0) out.unread = c.unreadCount > 0;
  return out;
}

export function accountPatch(p: Account, a: Account): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.label !== a.label) out.label = a.label;
  if (p.aiEnabled !== a.aiEnabled) out.aiEnabled = a.aiEnabled;
  if (p.notificationsEnabled !== a.notificationsEnabled) out.notificationsEnabled = a.notificationsEnabled;
  if (!p.isDefaultSender && a.isDefaultSender) out.isDefaultSender = true;
  if ((p.status === "paused") !== (a.status === "paused")) out.paused = a.status === "paused";
  return out;
}

/** Conversations whose label set changed: returns the full new set to PUT. */
export function diffConversationLabels(prev: Conversation[], next: Conversation[]): { conversationId: string; labelIds: string[] }[] {
  const before = new Map(prev.map((c) => [c.id, c.labels]));
  const out: { conversationId: string; labelIds: string[] }[] = [];
  for (const c of next) {
    const was = before.get(c.id);
    if (!was || was === c.labels) continue;
    const a = [...was].sort().join(",");
    const b = [...c.labels].sort().join(",");
    if (a !== b) out.push({ conversationId: c.id, labelIds: c.labels });
  }
  return out;
}

export interface ContactChanges {
  edits: Pick<Contact, "id" | "name" | "company" | "title" | "notes" | "vip">[];
  merges: { primaryId: string; secondaryId: string }[];
  unmerges: { primaryId: string; mergedId: string }[];
}

/**
 * Contacts can change three ways: field edits, a merge (one record disappears
 * into another's mergedFrom), or an unmerge (a record reappears from mergedFrom).
 */
export function diffContacts(prev: Contact[], next: Contact[]): ContactChanges {
  const before = new Map(prev.map((c) => [c.id, c]));
  const after = new Map(next.map((c) => [c.id, c]));
  const changes: ContactChanges = { edits: [], merges: [], unmerges: [] };

  for (const c of prev) {
    if (after.has(c.id)) continue;
    const primary = next.find((n) => n.mergedFrom.some((m) => m.id === c.id));
    if (primary) changes.merges.push({ primaryId: primary.id, secondaryId: c.id });
  }
  for (const c of next) {
    if (before.has(c.id)) continue;
    const primary = prev.find((p) => p.mergedFrom.some((m) => m.id === c.id));
    if (primary) changes.unmerges.push({ primaryId: primary.id, mergedId: c.id });
  }
  for (const c of next) {
    const p = before.get(c.id);
    if (!p || p === c) continue;
    if (p.name !== c.name || p.company !== c.company || p.title !== c.title || p.notes !== c.notes || p.vip !== c.vip) {
      changes.edits.push({ id: c.id, name: c.name, company: c.company, title: c.title, notes: c.notes, vip: c.vip });
    }
  }
  return changes;
}
