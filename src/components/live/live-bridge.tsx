"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { accountPatch, conversationPatch, diffById, diffContacts, diffConversationLabels, diffNotes } from "@/lib/live-diff";
import type { Conversation } from "@/lib/types";
import { useWorkspace, type WorkspaceState } from "@/store/workspace";

/**
 * Connects the workspace store to the live backend when the user is signed in:
 * hydrates the workspace, polls for new activity, lazily loads message history,
 * and mirrors every local edit to the API: conversation state, account
 * settings, reminders, notes, labels, drafts, scheduled messages, priority
 * rules, contacts (edits, merges, unmerges) and preferences.
 * Sample data never touches the network.
 */
export function LiveBridge() {
  const hydrating = useRef(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const outbox = new Outbox();

    const refresh = async (first: boolean) => {
      // Don't overwrite local edits that haven't been flushed yet.
      if (!first && outbox.pending()) return;
      const res = await fetch("/api/workspace").catch(() => null);
      if (!res?.ok || !alive) return;
      const data = await res.json();
      hydrating.current = true;
      useWorkspace.getState().hydrateLive({ ...data, preferences: first ? data.preferences : null });
      hydrating.current = false;
    };

    void (async () => {
      const s = await fetch("/api/session").then((r) => r.json()).catch(() => null);
      if (!alive || !s?.backend || !s.user) return;
      await refresh(true);
      timer = setInterval(() => void refresh(false), 60_000);
    })();

    const unsub = useWorkspace.subscribe((state, prev) => {
      if (hydrating.current || state.mode !== "live" || prev.mode !== "live") return;
      mirror(state, prev, outbox);
    });

    const flushOnHide = () => document.visibilityState === "hidden" && void outbox.flush();
    document.addEventListener("visibilitychange", flushOnHide);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      unsub();
      document.removeEventListener("visibilitychange", flushOnHide);
      void outbox.flush();
    };
  }, []);

  return null;
}

function mirror(state: WorkspaceState, prev: WorkspaceState, out: Outbox) {
  if (state.conversations !== prev.conversations) {
    const before = new Map(prev.conversations.map((c) => [c.id, c]));
    for (const c of state.conversations) {
      const p = before.get(c.id);
      if (!p || c.isDemo || c === p) continue;
      const patch = conversationPatch(p, c);
      if (Object.keys(patch).length) out.request(`/api/conversations/${c.id}`, "PATCH", patch);
    }
    for (const l of diffConversationLabels(prev.conversations, state.conversations)) out.request(`/api/conversations/${l.conversationId}/labels`, "PUT", { labelIds: l.labelIds }, `labels:${l.conversationId}`);
  }
  if (state.accounts !== prev.accounts) {
    const before = new Map(prev.accounts.map((a) => [a.id, a]));
    for (const a of state.accounts) {
      const p = before.get(a.id);
      if (!p || a.isDemo || a === p) continue;
      const patch = accountPatch(p, a);
      if (Object.keys(patch).length) out.request(`/api/accounts/${a.id}`, "PATCH", patch);
    }
  }
  if (state.reminders !== prev.reminders) out.collection("reminders", diffById(prev.reminders, state.reminders));
  if (state.labels !== prev.labels) out.collection("labels", diffById(prev.labels, state.labels));
  if (state.drafts !== prev.drafts) out.collection("drafts", diffById(prev.drafts, state.drafts));
  if (state.scheduled !== prev.scheduled) out.collection("scheduled", diffById(prev.scheduled, state.scheduled));
  if (state.priorityRules !== prev.priorityRules) out.collection("rules", diffById(prev.priorityRules, state.priorityRules));
  if (state.notes !== prev.notes) {
    const d = diffNotes(prev.notes, state.notes);
    out.collection("notes", { upserts: d.upserts.map((n) => ({ ...n, id: n.conversationId })), deletes: d.deletes });
  }
  if (state.contacts !== prev.contacts) {
    const c = diffContacts(prev.contacts, state.contacts);
    for (const m of c.merges) out.request("/api/contacts/merge", "POST", m, `merge:${m.secondaryId}`, true);
    for (const u of c.unmerges) out.request("/api/contacts/unmerge", "POST", u, `unmerge:${u.mergedId}`, true);
    out.collection("contacts", { upserts: c.edits, deletes: [] });
  }
  if (state.prefs !== prev.prefs) {
    out.request("/api/preferences", "PUT", { prefs: state.prefs, aiEnabled: state.prefs.aiEnabled, retentionDays: state.prefs.retentionDays }, "prefs");
  }
}

/**
 * Debounced, coalescing write queue. Requests with the same key collapse to the
 * latest body; collection upserts collapse by id. `ordered` requests (merges)
 * run before collection writes in each flush.
 */
class Outbox {
  private requests = new Map<string, { url: string; method: string; body: unknown; ordered: boolean }>();
  private collections = new Map<string, { upserts: Map<string, unknown>; deletes: Set<string> }>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing: Promise<void> | null = null;

  pending() {
    return this.requests.size > 0 || this.collections.size > 0 || !!this.flushing;
  }

  request(url: string, method: string, body: unknown, key = `${method} ${url}`, ordered = false) {
    const existing = this.requests.get(key);
    // PATCH bodies merge so two quick toggles on one conversation become one request.
    const merged = existing && method === "PATCH" ? { ...(existing.body as object), ...(body as object) } : body;
    this.requests.set(key, { url, method, body: merged, ordered });
    this.schedule();
  }

  collection(name: string, diff: { upserts: { id: string }[]; deletes: string[] }) {
    if (!diff.upserts.length && !diff.deletes.length) return;
    const c = this.collections.get(name) ?? { upserts: new Map(), deletes: new Set() };
    for (const u of diff.upserts) {
      c.upserts.set(u.id, u);
      c.deletes.delete(u.id);
    }
    for (const d of diff.deletes) {
      c.upserts.delete(d);
      c.deletes.add(d);
    }
    this.collections.set(name, c);
    this.schedule();
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 800);
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.flushing) await this.flushing;
    const requests = [...this.requests.values()];
    const collections = [...this.collections.entries()];
    this.requests.clear();
    this.collections.clear();
    if (!requests.length && !collections.length) return;

    this.flushing = (async () => {
      let failed = false;
      const call = async (url: string, method: string, body: unknown) => {
        const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => null);
        if (!r?.ok) failed = true;
      };
      for (const r of requests.filter((x) => x.ordered)) await call(r.url, r.method, r.body);
      await Promise.all([
        ...requests.filter((x) => !x.ordered).map((r) => call(r.url, r.method, r.body)),
        ...collections.map(([name, c]) => call(`/api/data/${name}`, "POST", { upserts: [...c.upserts.values()].map(stripNotesId(name)), deletes: [...c.deletes] })),
      ]);
      if (failed) toast.error("Some changes didn't save to the server", { description: "They're kept here and will be retried when you edit again or reload." });
    })();
    await this.flushing;
    this.flushing = null;
  }
}

/** Notes are keyed by conversation; the synthetic `id` used for coalescing isn't sent. */
const stripNotesId = (name: string) => (u: unknown) => {
  if (name !== "notes") return u;
  const rest: Record<string, unknown> = { ...(u as Record<string, unknown>) };
  delete rest.id;
  return rest;
};

/** Loads history for a live conversation the first time it's opened. */
export function useEnsureMessages(conversation: Conversation | undefined) {
  const loaded = useWorkspace((s) => (conversation ? s.messages[conversation.id] !== undefined : true));
  useEffect(() => {
    if (!conversation || conversation.isDemo || loaded) return;
    let alive = true;
    void fetch(`/api/conversations/${conversation.id}/messages`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => alive && useWorkspace.getState().setMessages(conversation.id, d.messages))
      .catch(() => alive && toast.error("Couldn't load this conversation's messages"));
    return () => {
      alive = false;
    };
  }, [conversation, loaded]);
}
