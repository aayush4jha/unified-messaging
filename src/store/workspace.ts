"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDemoData } from "@/lib/demo/seed";
import { DEFAULT_PRIORITY_RULES } from "@/lib/intelligence/priority";
import type {
  AccentName,
  Account,
  AppNotification,
  Attachment,
  Contact,
  Conversation,
  ConversationNote,
  Density,
  Draft,
  Label,
  Message,
  PlatformId,
  PriorityRule,
  QuickFilter,
  QuietHours,
  Reminder,
  ScheduledMessage,
  SendRequest,
  SendResult,
  ThemePreference,
} from "@/lib/types";
import { newId, uid } from "@/lib/utils";
import { transportFor } from "./transport";

export type WorkspaceMode = "empty" | "demo" | "live";

export interface Preferences {
  theme: ThemePreference;
  accent: AccentName;
  density: Density;
  sidebarCollapsed: boolean;
  contactPanelOpen: boolean;
  defaultFilter: QuickFilter;
  quietHours: QuietHours;
  doNotDisturb: boolean;
  priorityOnlyNotifications: boolean;
  desktopNotifications: boolean;
  notificationSound: boolean;
  aiEnabled: boolean;
  aiIncludeAttachmentsNames: boolean;
  smartReplies: boolean;
  retentionDays: number;
  sendShortcut: "enter" | "mod-enter";
  undoSendSeconds: number;
  onboarded: boolean;
  usage: "personal" | "professional" | "both";
}

export const DEFAULT_PREFS: Preferences = {
  theme: "system",
  accent: "vermilion",
  density: "comfortable",
  sidebarCollapsed: false,
  contactPanelOpen: true,
  defaultFilter: "all",
  quietHours: { enabled: false, start: "22:00", end: "07:30" },
  doNotDisturb: false,
  priorityOnlyNotifications: false,
  desktopNotifications: false,
  notificationSound: false,
  aiEnabled: true,
  aiIncludeAttachmentsNames: true,
  smartReplies: true,
  retentionDays: 365,
  sendShortcut: "mod-enter",
  undoSendSeconds: 5,
  onboarded: false,
  usage: "both",
};

interface SidebarState {
  order: PlatformId[];
  collapsed: PlatformId[];
  hiddenPlatforms: PlatformId[];
  pinnedAccounts: string[];
  hiddenSections: ("folders" | "pinned" | "accounts" | "workspace")[];
}

export interface WorkspaceState {
  mode: WorkspaceMode;
  hydrated: boolean;
  accounts: Account[];
  contacts: Contact[];
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  reminders: Reminder[];
  notes: Record<string, ConversationNote>;
  drafts: Draft[];
  scheduled: ScheduledMessage[];
  labels: Label[];
  notifications: AppNotification[];
  priorityRules: PriorityRule[];
  sidebar: SidebarState;
  prefs: Preferences;

  /* lifecycle */
  setHydrated(): void;
  loadDemo(): void;
  resetWorkspace(): void;
  hydrateLive(
    data: Pick<WorkspaceState, "accounts" | "conversations" | "labels" | "reminders" | "notes" | "notifications"> &
      Partial<Pick<WorkspaceState, "contacts" | "drafts" | "scheduled" | "priorityRules">> & { preferences?: Partial<Preferences> | null },
  ): void;
  setMessages(conversationId: string, messages: Message[]): void;

  /* conversations */
  patchConversation(id: string, patch: Partial<Conversation>): void;
  toggleStar(id: string): void;
  togglePin(id: string): void;
  toggleImportant(id: string): void;
  toggleMute(id: string): void;
  setArchived(ids: string[], archived: boolean): void;
  markRead(id: string): void;
  markUnread(id: string): void;
  snooze(id: string, until: string): void;
  unsnooze(id: string): void;
  toggleLabel(conversationId: string, labelId: string): void;
  setNote(conversationId: string, body: string): void;

  /* sending */
  send(req: Omit<SendRequest, "clientId"> & { clientId?: string }): Promise<SendResult>;
  retry(conversationId: string, messageId: string): Promise<SendResult | null>;
  discardFailed(conversationId: string, messageId: string): void;
  saveDraft(draft: Omit<Draft, "id" | "updatedAt"> & { id?: string }): string;
  deleteDraft(id: string): void;
  schedule(msg: Omit<ScheduledMessage, "id" | "createdAt">): string;
  cancelScheduled(id: string): void;

  /* reminders */
  addReminder(r: Omit<Reminder, "id" | "createdAt">): string;
  updateReminder(id: string, patch: Partial<Reminder>): void;
  completeReminder(id: string, done?: boolean): void;
  deleteReminder(id: string): void;

  /* contacts */
  updateContact(id: string, patch: Partial<Contact>): void;
  mergeContacts(primaryId: string, secondaryId: string): void;
  unmergeContact(primaryId: string, mergedId: string): void;

  /* notifications */
  pushNotification(n: Omit<AppNotification, "id" | "createdAt" | "read">): void;
  markNotificationRead(id: string): void;
  markAllNotificationsRead(): void;
  clearNotifications(): void;

  /* accounts */
  updateAccount(id: string, patch: Partial<Account>): void;
  removeAccount(id: string): void;
  setDefaultSender(id: string): void;
  upsertAccounts(accounts: Account[]): void;

  /* sidebar + prefs */
  toggleSidebarPlatform(p: PlatformId): void;
  movePlatform(p: PlatformId, dir: -1 | 1): void;
  togglePlatformHidden(p: PlatformId): void;
  togglePinnedAccount(id: string): void;
  toggleSection(s: SidebarState["hiddenSections"][number]): void;
  setPrefs(patch: Partial<Preferences>): void;

  /* rules + labels */
  addRule(rule: Omit<PriorityRule, "id">): void;
  updateRule(id: string, patch: Partial<PriorityRule>): void;
  deleteRule(id: string): void;
  addLabel(name: string, hue: number): string;
  deleteLabel(id: string): void;
}

const DEFAULT_SIDEBAR: SidebarState = {
  order: ["gmail", "outlook", "slack", "whatsapp", "telegram", "linkedin", "instagram", "messenger", "teams", "discord", "imap"],
  collapsed: [],
  hiddenPlatforms: [],
  pinnedAccounts: [],
  hiddenSections: [],
};

const emptyData = () => ({
  accounts: [] as Account[],
  contacts: [] as Contact[],
  conversations: [] as Conversation[],
  messages: {} as Record<string, Message[]>,
  reminders: [] as Reminder[],
  notes: {} as Record<string, ConversationNote>,
  drafts: [] as Draft[],
  scheduled: [] as ScheduledMessage[],
  labels: [] as Label[],
  notifications: [] as AppNotification[],
});

/** Tracks in-flight sends so double-clicks/retries never duplicate. */
const inflight = new Map<string, Promise<SendResult>>();

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => {
      const mapConv = (id: string, fn: (c: Conversation) => Partial<Conversation>) =>
        set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, ...fn(c) } : c)) }));

      const applySendResult = (convId: string, clientId: string, result: SendResult, req: SendRequest) => {
        set((s) => {
          const list = s.messages[convId] ?? [];
          const updated = list.map((m) =>
            m.clientId === clientId
              ? result.ok
                ? { ...m, ...result.message, conversationId: convId, id: m.id, status: result.message.status, error: undefined }
                : { ...m, status: "failed" as const, error: result.error }
              : m,
          );
          const conversations = s.conversations.map((c) =>
            c.id === convId && result.ok
              ? { ...c, lastMessageAt: result.message.sentAt, preview: req.body.replace(/\s+/g, " ").slice(0, 180), lastAuthorId: "me", messageCount: updated.length }
              : c,
          );
          return { messages: { ...s.messages, [convId]: updated }, conversations };
        });
      };

      return {
        mode: "empty",
        hydrated: false,
        ...emptyData(),
        priorityRules: DEFAULT_PRIORITY_RULES,
        sidebar: DEFAULT_SIDEBAR,
        prefs: DEFAULT_PREFS,

        setHydrated: () => set({ hydrated: true }),

        loadDemo: () => {
          const data = createDemoData();
          set({ ...data, mode: "demo" });
        },

        hydrateLive: ({ preferences, ...data }) =>
          set((s) => ({
            ...data,
            mode: "live",
            // Keep already-loaded message lists for conversations that still exist.
            messages: Object.fromEntries(Object.entries(s.mode === "live" ? s.messages : {}).filter(([id]) => data.conversations.some((c) => c.id === id))),
            contacts: data.contacts ?? (s.mode === "live" ? s.contacts : []),
            drafts: data.drafts ?? (s.mode === "live" ? s.drafts : []),
            scheduled: data.scheduled ?? (s.mode === "live" ? s.scheduled : []),
            priorityRules: data.priorityRules?.length ? data.priorityRules : s.priorityRules,
            // Server preferences (from another device) apply only when provided, i.e. on first load.
            prefs: preferences ? { ...s.prefs, ...preferences, onboarded: true } : s.prefs,
          })),
        setMessages: (conversationId, messages) =>
          set((s) => {
            const pending = (s.messages[conversationId] ?? []).filter((m) => m.status === "pending" || m.status === "failed");
            return { messages: { ...s.messages, [conversationId]: [...messages, ...pending.filter((p) => !messages.some((m) => m.clientId && m.clientId === p.clientId))] } };
          }),

        resetWorkspace: () => {
          set({ ...emptyData(), mode: "empty", priorityRules: DEFAULT_PRIORITY_RULES, sidebar: DEFAULT_SIDEBAR });
        },

        patchConversation: (id, patch) => mapConv(id, () => patch),
        toggleStar: (id) => mapConv(id, (c) => ({ starred: !c.starred })),
        togglePin: (id) => mapConv(id, (c) => ({ pinned: !c.pinned })),
        toggleImportant: (id) => mapConv(id, (c) => ({ important: !c.important })),
        toggleMute: (id) => mapConv(id, (c) => ({ muted: !c.muted })),
        setArchived: (ids, archived) =>
          set((s) => ({ conversations: s.conversations.map((c) => (ids.includes(c.id) ? { ...c, archived, snoozedUntil: archived ? undefined : c.snoozedUntil } : c)) })),
        markRead: (id) => {
          const c = get().conversations.find((x) => x.id === id);
          if (!c || c.unreadCount === 0) return;
          mapConv(id, () => ({ unreadCount: 0 }));
          set((s) => ({ notifications: s.notifications.map((n) => (n.conversationId === id ? { ...n, read: true } : n)) }));
        },
        markUnread: (id) => mapConv(id, (c) => ({ unreadCount: Math.max(1, c.unreadCount) })),
        snooze: (id, until) => mapConv(id, () => ({ snoozedUntil: until, archived: false })),
        unsnooze: (id) => mapConv(id, () => ({ snoozedUntil: undefined })),
        toggleLabel: (cid, lid) => mapConv(cid, (c) => ({ labels: c.labels.includes(lid) ? c.labels.filter((l) => l !== lid) : [...c.labels, lid] })),
        setNote: (cid, body) =>
          set((s) => {
            const notes = { ...s.notes };
            if (body.trim()) notes[cid] = { conversationId: cid, body, updatedAt: new Date().toISOString() };
            else delete notes[cid];
            return { notes };
          }),

        send: async (input) => {
          const clientId = input.clientId ?? uid("cl");
          const existing = inflight.get(clientId);
          if (existing) return existing;

          const req: SendRequest = { ...input, clientId };
          const account = get().accounts.find((a) => a.id === req.accountId);
          if (!account) return { ok: false, error: "Account not found.", retryable: false };

          // New conversation (compose) vs reply
          let convId = req.conversationId;
          if (!convId) {
            convId = `cv_${clientId}`;
            const recipient = req.to[0] ?? "New conversation";
            const contact = get().contacts.find(
              (c) => c.emails.includes(recipient) || c.handles.some((h) => h.value === recipient) || c.name === recipient,
            );
            const conv: Conversation = {
              id: convId,
              accountId: account.id,
              platform: account.platform,
              kind: account.platform === "gmail" || account.platform === "outlook" || account.platform === "imap" ? "email" : "dm",
              title: req.subject?.trim() || contact?.name || recipient,
              participants: req.to.map((t) => {
                const c = get().contacts.find((x) => x.emails.includes(t) || x.handles.some((h) => h.value === t) || x.name === t);
                return { id: c?.id ?? `x_${t}`, name: c?.name ?? t, handle: t, contactId: c?.id, avatarHue: c?.avatarHue };
              }),
              contactId: contact?.id,
              lastMessageAt: new Date().toISOString(),
              preview: req.body.slice(0, 180),
              lastAuthorId: "me",
              unreadCount: 0,
              starred: false,
              pinned: false,
              archived: false,
              important: false,
              priority: "normal",
              priorityReasons: [],
              category: "personal",
              labels: [],
              hasAttachments: req.attachments.length > 0,
              muted: false,
              messageCount: 0,
              isDemo: account.isDemo,
            };
            set((s) => ({ conversations: [conv, ...s.conversations] }));
          }

          const pending: Message = {
            id: `msg_${clientId}`,
            conversationId: convId,
            authorId: "me",
            body: req.body,
            sentAt: new Date().toISOString(),
            status: "pending",
            attachments: req.attachments,
            subject: req.subject,
            to: req.to,
            cc: req.cc,
            clientId,
            isDemo: account.isDemo,
          };
          set((s) => ({ messages: { ...s.messages, [convId!]: [...(s.messages[convId!] ?? []), pending] } }));

          const p = transportFor(account)
            .send({ ...req, conversationId: req.conversationId }, account)
            .then((result) => {
              applySendResult(convId!, clientId, result, req);
              return result.ok ? { ...result, conversationId: convId! } : result;
            })
            .finally(() => inflight.delete(clientId));
          inflight.set(clientId, p);
          return p;
        },

        retry: async (convId, messageId) => {
          const msg = get().messages[convId]?.find((m) => m.id === messageId);
          const conv = get().conversations.find((c) => c.id === convId);
          if (!msg || !conv || msg.status !== "failed" || !msg.clientId) return null;
          set((s) => ({
            messages: { ...s.messages, [convId]: s.messages[convId].map((m) => (m.id === messageId ? { ...m, status: "pending", error: undefined } : m)) },
          }));
          const account = get().accounts.find((a) => a.id === conv.accountId)!;
          const req: SendRequest = {
            clientId: msg.clientId,
            accountId: conv.accountId,
            // Conversations created by compose use `cv_<clientId>` until the first send succeeds.
            conversationId: convId === `cv_${msg.clientId}` ? undefined : convId,
            to: msg.to ?? [],
            cc: msg.cc,
            subject: msg.subject,
            body: msg.body,
            attachments: msg.attachments,
          };
          const existing = inflight.get(msg.clientId);
          if (existing) return existing;
          const p = transportFor(account)
            .send(req, account)
            .then((result) => {
              applySendResult(convId, msg.clientId!, result, req);
              return result;
            })
            .finally(() => inflight.delete(msg.clientId!));
          inflight.set(msg.clientId, p);
          return p;
        },

        discardFailed: (convId, messageId) =>
          set((s) => {
            const list = (s.messages[convId] ?? []).filter((m) => m.id !== messageId);
            const conversations = list.length === 0 ? s.conversations.filter((c) => c.id !== convId) : s.conversations;
            return { messages: { ...s.messages, [convId]: list }, conversations };
          }),

        saveDraft: (d) => {
          const id = d.id ?? newId();
          set((s) => {
            const draft: Draft = { ...d, id, updatedAt: new Date().toISOString() };
            const exists = s.drafts.some((x) => x.id === id);
            return { drafts: exists ? s.drafts.map((x) => (x.id === id ? draft : x)) : [draft, ...s.drafts] };
          });
          return id;
        },
        deleteDraft: (id) => set((s) => ({ drafts: s.drafts.filter((d) => d.id !== id) })),
        schedule: (m) => {
          const id = newId();
          set((s) => ({ scheduled: [...s.scheduled, { ...m, id, createdAt: new Date().toISOString() }] }));
          return id;
        },
        cancelScheduled: (id) => set((s) => ({ scheduled: s.scheduled.filter((x) => x.id !== id) })),

        addReminder: (r) => {
          const id = newId();
          set((s) => ({ reminders: [{ ...r, id, createdAt: new Date().toISOString() }, ...s.reminders] }));
          return id;
        },
        updateReminder: (id, patch) => set((s) => ({ reminders: s.reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
        completeReminder: (id, done = true) =>
          set((s) => ({ reminders: s.reminders.map((r) => (r.id === id ? { ...r, completedAt: done ? new Date().toISOString() : undefined } : r)) })),
        deleteReminder: (id) => set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) })),

        updateContact: (id, patch) => set((s) => ({ contacts: s.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
        mergeContacts: (primaryId, secondaryId) =>
          set((s) => {
            const primary = s.contacts.find((c) => c.id === primaryId);
            const secondary = s.contacts.find((c) => c.id === secondaryId);
            if (!primary || !secondary || primaryId === secondaryId) return {};
            const merged: Contact = {
              ...primary,
              emails: Array.from(new Set([...primary.emails, ...secondary.emails])),
              phones: Array.from(new Set([...primary.phones, ...secondary.phones])),
              handles: [...primary.handles, ...secondary.handles.filter((h) => !primary.handles.some((p) => p.platform === h.platform && p.value === h.value))],
              notes: [primary.notes, secondary.notes].filter(Boolean).join("\n\n"),
              vip: primary.vip || secondary.vip,
              mergedFrom: [
                ...primary.mergedFrom,
                { id: secondary.id, name: secondary.name, handles: secondary.handles, emails: secondary.emails, phones: secondary.phones },
                ...secondary.mergedFrom,
              ],
            };
            const rewire = (c: Conversation): Conversation => ({
              ...c,
              contactId: c.contactId === secondaryId ? primaryId : c.contactId,
              participants: c.participants.map((p) => (p.contactId === secondaryId ? { ...p, contactId: primaryId, name: p.name } : p)),
            });
            return {
              contacts: s.contacts.filter((c) => c.id !== secondaryId).map((c) => (c.id === primaryId ? merged : c)),
              conversations: s.conversations.map(rewire),
              reminders: s.reminders.map((r) => (r.contactId === secondaryId ? { ...r, contactId: primaryId } : r)),
            };
          }),
        unmergeContact: (primaryId, mergedId) =>
          set((s) => {
            const primary = s.contacts.find((c) => c.id === primaryId);
            const record = primary?.mergedFrom.find((m) => m.id === mergedId);
            if (!primary || !record) return {};
            const restored: Contact = {
              id: record.id,
              name: record.name,
              avatarHue: primary.avatarHue + 40,
              emails: record.emails,
              phones: record.phones,
              handles: record.handles,
              notes: "",
              vip: false,
              mergedFrom: [],
              isDemo: primary.isDemo,
            };
            const keep: Contact = {
              ...primary,
              mergedFrom: primary.mergedFrom.filter((m) => m.id !== mergedId),
              handles: primary.handles.filter((h) => !record.handles.some((r) => r.platform === h.platform && r.value === h.value)),
              emails: primary.emails.filter((e) => !record.emails.includes(e) || primary.handles.some((h) => h.value === e && !record.handles.some((r) => r.value === e))),
              phones: primary.phones.filter((ph) => !record.phones.includes(ph)),
            };
            // Conversations reached through the merged record's handles go back to it.
            const handleValues = new Set([...record.handles.map((h) => h.value), ...record.emails]);
            const rewire = (c: Conversation): Conversation => {
              const belongs = c.participants.some((p) => p.contactId === primaryId && p.handle && handleValues.has(p.handle));
              if (!belongs) return c;
              return {
                ...c,
                contactId: c.contactId === primaryId ? mergedId : c.contactId,
                participants: c.participants.map((p) => (p.contactId === primaryId && p.handle && handleValues.has(p.handle) ? { ...p, contactId: mergedId } : p)),
              };
            };
            return {
              contacts: [...s.contacts.map((c) => (c.id === primaryId ? keep : c)), restored],
              conversations: s.conversations.map(rewire),
            };
          }),

        pushNotification: (n) =>
          set((s) => ({ notifications: [{ ...n, id: uid("nt"), createdAt: new Date().toISOString(), read: false }, ...s.notifications].slice(0, 200) })),
        markNotificationRead: (id) => set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
        markAllNotificationsRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
        clearNotifications: () => set({ notifications: [] }),

        updateAccount: (id, patch) => set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
        removeAccount: (id) =>
          set((s) => {
            const convIds = new Set(s.conversations.filter((c) => c.accountId === id).map((c) => c.id));
            const messages = { ...s.messages };
            const notes = { ...s.notes };
            convIds.forEach((cid) => {
              delete messages[cid];
              delete notes[cid];
            });
            const accounts = s.accounts.filter((a) => a.id !== id);
            return {
              accounts,
              conversations: s.conversations.filter((c) => !convIds.has(c.id)),
              messages,
              notes,
              drafts: s.drafts.filter((d) => d.accountId !== id),
              scheduled: s.scheduled.filter((x) => x.accountId !== id),
              reminders: s.reminders.filter((r) => !r.conversationId || !convIds.has(r.conversationId)),
              notifications: s.notifications.filter((n) => n.accountId !== id && (!n.conversationId || !convIds.has(n.conversationId))),
              mode: accounts.length === 0 && s.mode === "demo" ? "empty" : s.mode,
            };
          }),
        setDefaultSender: (id) =>
          set((s) => {
            const target = s.accounts.find((a) => a.id === id);
            if (!target) return {};
            return { accounts: s.accounts.map((a) => (a.platform === target.platform ? { ...a, isDefaultSender: a.id === id } : a)) };
          }),
        upsertAccounts: (incoming) =>
          set((s) => {
            const map = new Map(s.accounts.map((a) => [a.id, a]));
            incoming.forEach((a) => map.set(a.id, { ...map.get(a.id), ...a }));
            return { accounts: [...map.values()] };
          }),

        toggleSidebarPlatform: (p) =>
          set((s) => ({
            sidebar: { ...s.sidebar, collapsed: s.sidebar.collapsed.includes(p) ? s.sidebar.collapsed.filter((x) => x !== p) : [...s.sidebar.collapsed, p] },
          })),
        movePlatform: (p, dir) =>
          set((s) => {
            const order = [...s.sidebar.order];
            const i = order.indexOf(p);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= order.length) return {};
            [order[i], order[j]] = [order[j], order[i]];
            return { sidebar: { ...s.sidebar, order } };
          }),
        togglePlatformHidden: (p) =>
          set((s) => ({
            sidebar: {
              ...s.sidebar,
              hiddenPlatforms: s.sidebar.hiddenPlatforms.includes(p) ? s.sidebar.hiddenPlatforms.filter((x) => x !== p) : [...s.sidebar.hiddenPlatforms, p],
            },
          })),
        togglePinnedAccount: (id) =>
          set((s) => ({
            sidebar: {
              ...s.sidebar,
              pinnedAccounts: s.sidebar.pinnedAccounts.includes(id) ? s.sidebar.pinnedAccounts.filter((x) => x !== id) : [...s.sidebar.pinnedAccounts, id],
            },
          })),
        toggleSection: (sec) =>
          set((s) => ({
            sidebar: {
              ...s.sidebar,
              hiddenSections: s.sidebar.hiddenSections.includes(sec) ? s.sidebar.hiddenSections.filter((x) => x !== sec) : [...s.sidebar.hiddenSections, sec],
            },
          })),
        setPrefs: (patch) => set((s) => ({ prefs: { ...s.prefs, ...patch } })),

        addRule: (rule) => set((s) => ({ priorityRules: [...s.priorityRules, { ...rule, id: newId() }] })),
        updateRule: (id, patch) => set((s) => ({ priorityRules: s.priorityRules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
        deleteRule: (id) => set((s) => ({ priorityRules: s.priorityRules.filter((r) => r.id !== id) })),
        addLabel: (name, hue) => {
          const id = newId();
          set((s) => ({ labels: [...s.labels, { id, name, hue }] }));
          return id;
        },
        deleteLabel: (id) =>
          set((s) => ({ labels: s.labels.filter((l) => l.id !== id), conversations: s.conversations.map((c) => ({ ...c, labels: c.labels.filter((x) => x !== id) })) })),
      };
    },
    {
      name: "orbit-workspace-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        mode: s.mode,
        accounts: s.accounts,
        contacts: s.contacts,
        conversations: s.conversations,
        messages: Object.fromEntries(Object.entries(s.messages).map(([k, v]) => [k, v.filter((m) => m.status !== "pending")])),
        reminders: s.reminders,
        notes: s.notes,
        drafts: s.drafts,
        scheduled: s.scheduled,
        labels: s.labels,
        notifications: s.notifications,
        priorityRules: s.priorityRules,
        sidebar: s.sidebar,
        prefs: s.prefs,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<WorkspaceState>;
        return { ...current, ...p, prefs: { ...DEFAULT_PREFS, ...p.prefs }, sidebar: { ...DEFAULT_SIDEBAR, ...p.sidebar } };
      },
    },
  ),
);

export type AttachmentDraft = Attachment & { file?: File };
