"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { decide, showDesktopNotification } from "@/lib/notify";
import { accountPatch, conversationPatch, diffById, diffContacts, diffConversationLabels, diffNotes } from "@/lib/live-diff";
import type { Conversation } from "@/lib/types";
import { useWorkspace, type WorkspaceState } from "@/store/workspace";
import { Outbox } from "@/lib/outbox";
import { PUSH_FLAG } from "../pwa/push";

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
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

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

    let stopRealtime: (() => void) | undefined;
    void (async () => {
      const s = await fetch("/api/session").then((r) => r.json()).catch(() => null);
      if (!alive || !s?.backend || !s.user) return;
      await refresh(true);
      // Realtime when available; polling stays as a slower safety net.
      stopRealtime = startRealtime(s.user.id, () => void refresh(false), (href) => routerRef.current.push(href));
      timer = setInterval(() => void refresh(false), stopRealtime ? 5 * 60_000 : 60_000);
    })();

    const unsub = useWorkspace.subscribe((state, prev) => {
      if (hydrating.current || state.mode !== "live" || prev.mode !== "live") return;
      mirror(state, prev, outbox);
    });

    const flushOnHide = () => document.visibilityState === "hidden" && void outbox.flush();
    document.addEventListener("visibilitychange", flushOnHide);
    const onOnline = () => {
      outbox.online();
      void refresh(false);
    };
    window.addEventListener("online", onOnline);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      stopRealtime?.();
      unsub();
      document.removeEventListener("visibilitychange", flushOnHide);
      window.removeEventListener("online", onOnline);
      void outbox.flush();
    };
  }, []);

  return null;
}

/**
 * Subscribes to Postgres changes for this user (RLS-filtered by Supabase Realtime).
 * Coalesces bursts into one refresh, reloads open conversations, and surfaces
 * new notifications through the user's notification policy.
 */
function startRealtime(userId: string, refresh: () => void, navigate: (href: string) => void): (() => void) | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return undefined;
  const supabase = createBrowserClient(url, anon);
  let pending: ReturnType<typeof setTimeout> | null = null;
  const soon = () => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(refresh, 800);
  };
  const reloadConversation = (conversationId: string) => {
    if (useWorkspace.getState().messages[conversationId] === undefined) return; // not opened yet: loads on open
    void fetch(`/api/conversations/${conversationId}/messages`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && useWorkspace.getState().setMessages(conversationId, d.messages));
  };
  const channel = supabase
    .channel(`orbit:${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `user_id=eq.${userId}` }, soon)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `user_id=eq.${userId}` }, (payload) => {
      const conversationId = (payload.new as { conversation_id?: string }).conversation_id;
      if (conversationId) reloadConversation(conversationId);
      soon();
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
      const n = payload.new as { kind: "message" | "priority" | "reminder" | "system"; title: string; body: string; account_id?: string; conversation_id?: string };
      const { prefs, accounts, conversations } = useWorkspace.getState();
      const d = decide({ kind: n.kind }, { prefs, account: accounts.find((a) => a.id === n.account_id), conversation: conversations.find((c) => c.id === n.conversation_id) });
      if (d.deliver && d.interrupt) {
        toast(n.title, { description: n.body });
        // Devices with push turned on get the system notification from the push service instead.
        const pushHere = (() => {
          try {
            return localStorage.getItem(PUSH_FLAG) === "1";
          } catch {
            return false;
          }
        })();
        if (prefs.desktopNotifications && document.visibilityState === "hidden" && !pushHere) {
          const url = n.conversation_id ? `/inbox?c=${n.conversation_id}` : "/inbox";
          void showDesktopNotification(n.title, n.body, { url, tag: n.conversation_id, onClick: () => navigate(url) });
        }
      }
      soon();
    })
    .subscribe();
  return () => {
    if (pending) clearTimeout(pending);
    void supabase.removeChannel(channel);
  };
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
