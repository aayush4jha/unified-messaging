/**
 * Orbit domain model.
 *
 * These types are shared by the client store, the demo data source and the
 * server-side connectors. Server rows (see supabase/migrations) map 1:1 onto
 * them via src/server/mappers.ts.
 */

export type PlatformId =
  | "gmail"
  | "outlook"
  | "imap"
  | "slack"
  | "teams"
  | "telegram"
  | "whatsapp"
  | "discord"
  | "linkedin"
  | "instagram"
  | "messenger";

export type PlatformCategory = "email" | "messaging" | "professional" | "social";

/** What a connector can actually do. The UI never enables an action whose capability is false. */
export interface Capabilities {
  read: boolean;
  send: boolean;
  reply: boolean;
  compose: boolean; // start a brand-new conversation
  attachments: boolean;
  markRead: boolean;
  archive: boolean;
  readReceipts: boolean;
  threads: boolean;
  subjects: boolean;
  recipients: boolean; // to / cc / bcc
  reactions: boolean;
  realtime: boolean;
  drafts: boolean;
  schedule: boolean;
}

export type ConnectionStatus = "connected" | "syncing" | "needs_reauth" | "error" | "paused";

export interface Account {
  id: string;
  platform: PlatformId;
  /** User-facing label, e.g. "Personal", "Work", "Northwind workspace". */
  label: string;
  /** Address / handle / workspace domain. */
  handle: string;
  status: ConnectionStatus;
  statusMessage?: string;
  lastSyncedAt?: string;
  isDefaultSender?: boolean;
  /** Whether AI features may read this account's messages. */
  aiEnabled: boolean;
  notificationsEnabled: boolean;
  /** True for sample data that does not come from a real connection. */
  isDemo: boolean;
  /** Per-account capability overrides (e.g. a Telegram bot that can't start chats). */
  capabilityOverrides?: Partial<Capabilities>;
}

export type ConversationKind = "email" | "dm" | "group" | "channel";
export type ConversationCategory = "personal" | "professional" | "work";
export type Priority = "high" | "normal" | "low";

export interface Participant {
  id: string;
  name: string;
  handle?: string;
  contactId?: string;
  avatarHue?: number;
}

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url?: string;
}

export type DeliveryStatus = "pending" | "sent" | "delivered" | "read" | "failed";

export interface Reaction {
  emoji: string;
  count: number;
  mine?: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  /** Participant id, or "me" for the account owner. */
  authorId: string;
  body: string;
  sentAt: string;
  status: DeliveryStatus;
  attachments: Attachment[];
  /** Email-only fields */
  subject?: string;
  to?: string[];
  cc?: string[];
  /** Slack-style thread replies */
  threadReplyCount?: number;
  threadParticipants?: string[];
  reactions?: Reaction[];
  edited?: boolean;
  /** Idempotency key for outbound messages. */
  clientId?: string;
  error?: string;
  isDemo?: boolean;
}

export interface Conversation {
  id: string;
  accountId: string;
  platform: PlatformId;
  kind: ConversationKind;
  /** Email subject, chat name or channel name. */
  title: string;
  participants: Participant[];
  /** Primary contact (for DMs / 1:1 email). */
  contactId?: string;
  lastMessageAt: string;
  preview: string;
  lastAuthorId: string;
  unreadCount: number;
  starred: boolean;
  pinned: boolean;
  archived: boolean;
  snoozedUntil?: string;
  important: boolean;
  priority: Priority;
  priorityReasons: string[];
  category: ConversationCategory;
  labels: string[];
  hasAttachments: boolean;
  muted: boolean;
  messageCount: number;
  isDemo: boolean;
  /** Platform URL that opens the conversation in the native app (when known). */
  externalUrl?: string;
}

export interface ContactHandle {
  platform: PlatformId;
  value: string;
  accountId?: string;
}

export interface Contact {
  id: string;
  name: string;
  avatarHue: number;
  company?: string;
  title?: string;
  emails: string[];
  phones: string[];
  handles: ContactHandle[];
  notes: string;
  vip: boolean;
  /** Ids of other contact records merged into this one (for unmerge). */
  mergedFrom: { id: string; name: string; handles: ContactHandle[]; emails: string[]; phones: string[] }[];
  isDemo: boolean;
}

export type ReminderKind = "reminder" | "follow_up" | "task" | "awaiting_response";

export interface Reminder {
  id: string;
  kind: ReminderKind;
  title: string;
  conversationId?: string;
  contactId?: string;
  dueAt?: string;
  createdAt: string;
  completedAt?: string;
  note?: string;
  /** Set when created from an AI/heuristic suggestion. */
  source?: "user" | "suggestion";
}

export interface ConversationNote {
  conversationId: string;
  body: string;
  updatedAt: string;
}

export interface Draft {
  id: string;
  accountId: string;
  conversationId?: string;
  to: string[];
  subject?: string;
  body: string;
  updatedAt: string;
}

export interface ScheduledMessage {
  id: string;
  accountId: string;
  conversationId?: string;
  to: string[];
  subject?: string;
  body: string;
  sendAt: string;
  createdAt: string;
}

export interface Label {
  id: string;
  name: string;
  hue: number;
}

export type NotificationKind = "message" | "priority" | "reminder" | "system";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  conversationId?: string;
  accountId?: string;
  reminderId?: string;
}

export type FolderView =
  | "all"
  | "unread"
  | "starred"
  | "important"
  | "drafts"
  | "scheduled"
  | "archived"
  | "sent";

export type QuickFilter = "all" | "unread" | "starred" | "priority" | "personal" | "professional" | "work";
export type SortMode = "recent" | "oldest" | "unread" | "priority" | "platform";

export interface PriorityRule {
  id: string;
  kind: "sender" | "keyword" | "account" | "platform";
  value: string;
  effect: "boost" | "lower";
  enabled: boolean;
}

export interface QuietHours {
  enabled: boolean;
  start: string; // "22:00"
  end: string; // "07:30"
}

export type ThemePreference = "light" | "dark" | "system";
export type AccentName = "vermilion" | "moss" | "cobalt" | "amber" | "graphite";
export type Density = "comfortable" | "compact";

export interface SendRequest {
  clientId: string;
  accountId: string;
  conversationId?: string;
  to: string[];
  cc?: string[];
  subject?: string;
  body: string;
  attachments: Attachment[];
}

export type SendResult =
  | { ok: true; message: Message; conversationId: string }
  | { ok: false; error: string; retryable: boolean };
