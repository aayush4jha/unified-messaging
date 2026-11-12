"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { Account, Conversation } from "@/lib/types";
import { useWorkspace } from "@/store/workspace";

/**
 * Connects the workspace store to the live backend when the user is signed in:
 * hydrates accounts and conversations, polls for new activity, lazily loads
 * message history, and mirrors local actions (star, archive, read, snooze,
 * account settings) to the API. Sample data never touches the network.
 */
export function LiveBridge() {
  const hydrating = useRef(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    const refresh = async () => {
      const res = await fetch("/api/workspace").catch(() => null);
      if (!res?.ok || !alive) return;
      const data = await res.json();
      hydrating.current = true;
      useWorkspace.getState().hydrateLive(data);
      hydrating.current = false;
    };

    void (async () => {
      const s = await fetch("/api/session").then((r) => r.json()).catch(() => null);
      if (!alive || !s?.backend || !s.user) return;
      const { accounts, mode } = useWorkspace.getState();
      // Signed in with no live accounts yet: keep the sample workspace (if loaded) until something connects.
      await refresh();
      if (useWorkspace.getState().accounts.length === 0 && mode === "demo" && accounts.length) useWorkspace.getState().loadDemo();
      timer = setInterval(refresh, 60_000);
    })();

    // Mirror conversation/account changes for live records.
    const unsub = useWorkspace.subscribe((state, prev) => {
      if (hydrating.current || state.mode !== "live") return;
      if (state.conversations !== prev.conversations) {
        const before = new Map(prev.conversations.map((c) => [c.id, c]));
        for (const c of state.conversations) {
          const p = before.get(c.id);
          if (!p || c.isDemo || c === p) continue;
          const patch = conversationPatch(p, c);
          if (Object.keys(patch).length) void send(`/api/conversations/${c.id}`, "PATCH", patch);
        }
      }
      if (state.accounts !== prev.accounts) {
        const before = new Map(prev.accounts.map((a) => [a.id, a]));
        for (const a of state.accounts) {
          const p = before.get(a.id);
          if (!p || a.isDemo || a === p) continue;
          const patch = accountPatch(p, a);
          if (Object.keys(patch).length) void send(`/api/accounts/${a.id}`, "PATCH", patch);
        }
      }
    });

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      unsub();
    };
  }, []);

  return null;
}

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

function conversationPatch(p: Conversation, c: Conversation): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ["starred", "pinned", "important", "archived", "muted"] as const) if (p[k] !== c[k]) out[k] = c[k];
  if (p.snoozedUntil !== c.snoozedUntil) out.snoozedUntil = c.snoozedUntil ?? null;
  if ((p.unreadCount > 0) !== (c.unreadCount > 0)) out.unread = c.unreadCount > 0;
  return out;
}

function accountPatch(p: Account, a: Account): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.label !== a.label) out.label = a.label;
  if (p.aiEnabled !== a.aiEnabled) out.aiEnabled = a.aiEnabled;
  if (p.notificationsEnabled !== a.notificationsEnabled) out.notificationsEnabled = a.notificationsEnabled;
  if (!p.isDefaultSender && a.isDefaultSender) out.isDefaultSender = true;
  if ((p.status === "paused") !== (a.status === "paused")) out.paused = a.status === "paused";
  return out;
}

async function send(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!r?.ok) toast.error("Couldn't save that change to the server", { description: "It'll be corrected on the next sync." });
}
