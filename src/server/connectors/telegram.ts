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

  // Bots can upload up to 50 MB per file and download up to 20 MB.
  attachmentLimits: { perFile: 50 * 1024 * 1024, total: 50 * 1024 * 1024 },

  async send(ctx: ConnectorContext, msg) {
    if (!msg.externalConversationId) throw new ConnectorError("Telegram bots can only reply to people who messaged them first.", false);
    const files = msg.attachments ?? [];
    let last: TgMessage | undefined;
    if (msg.body.trim() && (files.length !== 1 || msg.body.length > 1024)) {
      last = await call<TgMessage>(ctx.tokens.accessToken, "sendMessage", { chat_id: msg.externalConversationId, text: msg.body });
    }
    for (const f of files) {
      const form = new FormData();
      form.set("chat_id", msg.externalConversationId);
      if (files.length === 1 && msg.body.trim() && msg.body.length <= 1024) form.set("caption", msg.body);
      form.set("document", new Blob([new Uint8Array(f.data)], { type: f.mimeType }), f.name);
      const res = await providerFetch(api(ctx.tokens.accessToken, "sendDocument"), { label: "telegram sendDocument", method: "POST", body: form });
      const d = await res.json();
      if (!d.ok) throw new ConnectorError(`Telegram sendDocument: ${d.description ?? res.status}`, res.status >= 500);
      last = d.result as TgMessage;
    }
    if (!last) throw new ConnectorError("Nothing to send.", false);
    return { externalMessageId: String(last.message_id), externalConversationId: String(last.chat.id), sentAt: new Date(last.date * 1000).toISOString() };
  },

  async downloadAttachment(ctx, _messageId, att) {
    if (!att.externalId) throw new ConnectorError("This file can't be downloaded.", false);
    const f = await call<{ file_path?: string; file_size?: number }>(ctx.tokens.accessToken, "getFile", { file_id: att.externalId });
    if (!f.file_path) throw new ConnectorError("Telegram only lets bots download files up to 20 MB.", false);
    const res = await providerFetch(`https://api.telegram.org/file/bot${ctx.tokens.accessToken}/${f.file_path}`, { label: "telegram file" });
    if (!res.ok) throw new ConnectorError(`Couldn't download file (${res.status})`, false);
    return { data: Buffer.from(await res.arrayBuffer()), mimeType: att.mimeType, name: att.name };
  },
};
