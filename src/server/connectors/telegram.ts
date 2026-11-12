import { AuthError, ConnectorError, providerFetch, type Connector, type ConnectorContext, type NormalizedConversation, type NormalizedMessage } from "./types";

/**
 * Telegram Bot API connector.
 *
 * A bot only sees chats people start with it (or groups it's added to) and
 * can't message someone first. Updates arrive by webhook (secret-token
 * verified) or, when Orbit has no public URL, by getUpdates polling.
 */

const api = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

export const BOT_TOKEN_RE = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/;

async function call<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await providerFetch(api(token, method), {
    label: `telegram ${method}`,
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await res.json();
  if (!d.ok) {
    if (res.status === 401 || res.status === 404) throw new AuthError("Telegram rejected the bot token. It may have been revoked in @BotFather.");
    throw new ConnectorError(`Telegram ${method}: ${d.description ?? res.status}`, res.status >= 500);
  }
  return d.result as T;
}

export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}
export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}
export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  caption?: string;
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  photo?: { file_id: string; file_size?: number }[];
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
}

const displayName = (u?: { first_name?: string; last_name?: string; title?: string; username?: string }) =>
  [u?.first_name, u?.last_name].filter(Boolean).join(" ") || u?.title || (u?.username ? `@${u.username}` : "Unknown");

/** Pure: Telegram update → normalized conversation + message. Unit-tested. */
export function normalizeTelegramUpdate(update: TgUpdate, botId: number): { conversation: NormalizedConversation; message: NormalizedMessage } | null {
  const m = update.message ?? update.edited_message;
  if (!m) return null;
  const mine = m.from?.id === botId;
  const attachments = [
    ...(m.document ? [{ externalId: m.document.file_id, name: m.document.file_name ?? "file", mimeType: m.document.mime_type ?? "application/octet-stream", size: m.document.file_size ?? 0 }] : []),
    ...(m.photo?.length ? [{ externalId: m.photo[m.photo.length - 1].file_id, name: "photo.jpg", mimeType: "image/jpeg", size: m.photo[m.photo.length - 1].file_size ?? 0 }] : []),
  ];
  const sentAt = new Date(m.date * 1000).toISOString();
  return {
    conversation: {
      externalId: String(m.chat.id),
      kind: m.chat.type === "private" ? "dm" : m.chat.type === "channel" ? "channel" : "group",
      title: m.chat.type === "private" ? displayName(m.chat) : (m.chat.title ?? "Group"),
      participants: m.from && !mine ? [{ externalId: String(m.from.id), name: displayName(m.from), handle: m.from.username ? `@${m.from.username}` : undefined }] : [],
      unreadCount: mine ? 0 : 1,
      lastMessageAt: sentAt,
      externalUrl: m.chat.username ? `https://t.me/${m.chat.username}` : undefined,
    },
    message: {
      externalId: String(m.message_id),
      authorExternalId: mine ? "me" : String(m.from?.id ?? m.chat.id),
      authorName: mine ? undefined : displayName(m.from ?? m.chat),
      sentAt,
      body: m.text ?? m.caption ?? (attachments.length ? "" : "(unsupported message type)"),
      attachments,
      metadata: update.edited_message ? { edited: true } : undefined,
    },
  };
}

export async function telegramGetMe(token: string): Promise<TgUser> {
  return call<TgUser>(token, "getMe");
}

export async function telegramSetWebhook(token: string, url: string, secret: string): Promise<void> {
  await call(token, "setWebhook", { url, secret_token: secret, allowed_updates: ["message", "edited_message"], drop_pending_updates: false });
}

export async function telegramDeleteWebhook(token: string): Promise<void> {
  await call(token, "deleteWebhook", {}).catch(() => undefined);
}

export async function telegramGetUpdates(token: string, offset?: number): Promise<TgUpdate[]> {
  return call<TgUpdate[]>(token, "getUpdates", { offset, timeout: 0, allowed_updates: ["message", "edited_message"] });
}

export const TelegramConnector: Connector = {
  platform: "telegram",
  // No app-level credentials: each bot brings its own token.
  isConfigured: () => true,

  async revoke(tokens) {
    await telegramDeleteWebhook(tokens.accessToken);
  },

  // The Bot API has no "list my chats". Conversations are created as updates arrive.
  async listConversations() {
    return { items: [] };
  },
  async listMessages() {
    return { items: [] };
  },

  async send(ctx: ConnectorContext, msg) {
    if (!msg.externalConversationId) throw new ConnectorError("Telegram bots can only reply to people who messaged them first.", false);
    const r = await call<TgMessage>(ctx.tokens.accessToken, "sendMessage", { chat_id: msg.externalConversationId, text: msg.body });
    return { externalMessageId: String(r.message_id), externalConversationId: String(r.chat.id), sentAt: new Date(r.date * 1000).toISOString() };
  },
};
