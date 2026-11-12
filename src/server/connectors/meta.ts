import { createHmac, timingSafeEqual } from "node:crypto";
import {
  AuthError,
  ConnectorError,
  providerFetch,
  type ConnectedIdentity,
  type Connector,
  type ConnectorContext,
  type NormalizedConversation,
  type NormalizedMessage,
} from "./types";

/**
 * Meta business messaging: Facebook Page messages (Messenger Platform),
 * Instagram professional accounts (Instagram API with Instagram Login), and the
 * WhatsApp Business Cloud API.
 *
 * None of these expose personal inboxes. Replies are limited to 24 hours
 * after the customer's last message (7 days with the Human Agent tag on
 * Messenger/Instagram, when the app has that permission). Production use needs
 * Meta App Review and Business Verification.
 *
 * Messenger and Instagram conversations are keyed by the customer's scoped id
 * (PSID / IGSID), so webhook events and synced history land in the same
 * conversation.
 */

const VER = () => process.env.META_GRAPH_VERSION || "v24.0";
const FB = () => `https://graph.facebook.com/${VER()}`;
const IG = () => `https://graph.instagram.com/${VER()}`;
const DAY = 86_400_000;

/* ------------------------------------------------------------------ webhooks (pure, unit-tested) */

/** Verifies `X-Hub-Signature-256: sha256=<hex>` (HMAC-SHA256 of the raw body with the app secret). */
export function verifyMetaSignature(rawBody: string, header: string | null, secrets: (string | undefined)[]): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const given = Buffer.from(header.slice(7), "hex");
  return secrets.filter(Boolean).some((secret) => {
    const expected = createHmac("sha256", secret!).update(rawBody).digest();
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export interface MetaMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: { mid: string; text?: string; is_echo?: boolean; attachments?: { type: string; payload?: { url?: string } }[] };
}

/** Messenger / Instagram webhook event → conversation keyed by the customer's id. */
export function normalizeMessagingEvent(ev: MetaMessagingEvent, accountExternalId: string, platform: "messenger" | "instagram"): { conversation: NormalizedConversation; message: NormalizedMessage } | null {
  if (!ev.message?.mid) return null;
  const fromBusiness = ev.message.is_echo || ev.sender.id === accountExternalId;
  const customer = fromBusiness ? ev.recipient.id : ev.sender.id;
  const sentAt = new Date(ev.timestamp).toISOString();
  return {
    conversation: {
      externalId: customer,
      kind: "dm",
      title: platform === "instagram" ? "Instagram user" : "Messenger user",
      participants: [{ externalId: customer, name: platform === "instagram" ? "Instagram user" : "Messenger user" }],
      unreadCount: fromBusiness ? 0 : 1,
      lastMessageAt: sentAt,
    },
    message: {
      externalId: ev.message.mid,
      authorExternalId: fromBusiness ? "me" : customer,
      sentAt,
      body: ev.message.text ?? (ev.message.attachments?.length ? "" : "(unsupported message)"),
      attachments: (ev.message.attachments ?? []).map((a, i) => ({ externalId: a.payload?.url, name: `${a.type}-${i + 1}`, mimeType: a.type === "image" ? "image/jpeg" : "application/octet-stream", size: 0 })),
    },
  };
}

export interface WhatsAppValue {
  metadata: { phone_number_id: string; display_phone_number?: string };
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  messages?: { from: string; id: string; timestamp: string; type: string; text?: { body: string }; document?: { id: string; filename?: string; mime_type?: string }; image?: { id: string; mime_type?: string; caption?: string }; audio?: { id: string; mime_type?: string }; video?: { id: string; mime_type?: string; caption?: string } }[];
  statuses?: { id: string; status: "sent" | "delivered" | "read" | "failed"; recipient_id: string; timestamp: string }[];
}

/** WhatsApp Cloud API webhook value → inbound messages + delivery status updates. */
export function normalizeWhatsApp(value: WhatsAppValue): { messages: { conversation: NormalizedConversation; message: NormalizedMessage }[]; statuses: { externalId: string; status: "sent" | "delivered" | "read" | "failed" }[] } {
  const names = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
  const messages = (value.messages ?? []).map((m) => {
    const name = names.get(m.from) ?? `+${m.from}`;
    const media = m.document ?? m.image ?? m.audio ?? m.video;
    const sentAt = new Date(Number(m.timestamp) * 1000).toISOString();
    return {
      conversation: { externalId: m.from, kind: "dm" as const, title: name, participants: [{ externalId: m.from, name, handle: `+${m.from}` }], unreadCount: 1, lastMessageAt: sentAt },
      message: {
        externalId: m.id,
        authorExternalId: m.from,
        authorName: name,
        sentAt,
        body: m.text?.body ?? m.image?.caption ?? m.video?.caption ?? (media ? "" : `(${m.type} message)`),
        attachments: media ? [{ externalId: media.id, name: m.document?.filename ?? `${m.type}`, mimeType: media.mime_type ?? "application/octet-stream", size: 0 }] : [],
      },
    };
  });
  return { messages, statuses: (value.statuses ?? []).map((s) => ({ externalId: s.id, status: s.status })) };
}

/** Which send mode the reply window allows. Pure, so the policy is testable. */
export function replyMode(lastCustomerMessageAt: number | undefined, now: number, humanAgent: boolean): { ok: true; tag?: "HUMAN_AGENT" } | { ok: false; reason: string } {
  if (!lastCustomerMessageAt) return { ok: false, reason: "The customer hasn't messaged you yet. Businesses can only reply to people who wrote first." };
  const age = now - lastCustomerMessageAt;
  if (age <= DAY) return { ok: true };
  if (humanAgent && age <= 7 * DAY) return { ok: true, tag: "HUMAN_AGENT" };
  return { ok: false, reason: "The 24-hour reply window has closed. Only approved message templates can be sent now." };
}

/* ------------------------------------------------------------------ shared HTTP */

async function metaFetch<T>(url: string, init: RequestInit & { label: string }): Promise<T> {
  const res = await providerFetch(url, init);
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = d.error ?? {};
    if (err.code === 190 || res.status === 401) throw new AuthError("Meta access expired or was revoked. Reconnect the account.");
    // Messenger: code 10 / subcode 2018278; WhatsApp: 131047 "re-engagement message".
    if (err.error_subcode === 2018278 || err.code === 131047) throw new ConnectorError("The 24-hour reply window has closed. Only approved templates can be sent.", false);
    if (err.code === 10 || err.code === 200) throw new AuthError(err.message ?? "Missing Meta permission. Reconnect and approve all permissions.");
    if (err.code === 4 || err.code === 17 || err.code === 32 || err.code === 613) throw new ConnectorError("Meta rate limit reached; retrying later.", true);
    throw new ConnectorError(`${init.label}: ${err.message ?? res.status}`, res.status >= 500);
  }
  return d as T;
}

const qs = (p: Record<string, string>) => new URLSearchParams(p).toString();

/* ------------------------------------------------------------------ Messenger (Facebook Pages) */

export const MESSENGER_SCOPES = ["pages_show_list", "pages_messaging", "pages_manage_metadata", "pages_read_engagement", "business_management"];

export const MessengerConnector: Connector = {
  platform: "messenger",
  isConfigured: () => !!(process.env.META_APP_ID && process.env.META_APP_SECRET),

  getAuthorizationUrl(state, redirectUri) {
    return `https://www.facebook.com/${VER()}/dialog/oauth?${qs({ client_id: process.env.META_APP_ID!, redirect_uri: redirectUri, state, scope: MESSENGER_SCOPES.join(","), response_type: "code" })}`;
  },

  /** One login can manage several Pages; each becomes its own account. */
  async exchangeCode(code, redirectUri): Promise<ConnectedIdentity[]> {
    const pages = await messengerPages(code, redirectUri);
    if (!pages.length) throw new ConnectorError("No Facebook Pages were shared with Orbit. Reconnect and select at least one Page.", false);
    return pages;
  },

  async listConversations(ctx, cursor) {
    const pageId = ctx.tokens.extra?.pageId ?? "";
    const url = cursor ?? `${FB()}/${pageId}/conversations?${qs({ platform: "messenger", fields: "id,updated_time,unread_count,link,participants,messages.limit(25){id,created_time,from,message}", limit: "25", access_token: ctx.tokens.accessToken })}`;
    const r = await metaFetch<{ data: FbConversation[]; paging?: { next?: string } }>(url, { label: "page conversations" });
    return { items: r.data.map((c) => fbConversation(c, pageId)).filter(Boolean) as NormalizedConversation[], nextCursor: r.paging?.next };
  },

  async listMessages() {
    // Messages arrive with listConversations (nested field) and via webhooks.
    return { items: [] };
  },

  async send(ctx, msg) {
    return pageOrIgSend(`${FB()}/${ctx.tokens.extra?.pageId}/messages`, ctx, msg, "messenger");
  },
};

interface FbConversation {
  id: string;
  updated_time: string;
  unread_count?: number;
  link?: string;
  participants?: { data: { id: string; name?: string; username?: string }[] };
  messages?: { data: { id: string; created_time: string; from?: { id: string; name?: string; username?: string }; message?: string }[] };
}

function fbConversation(c: FbConversation, businessId: string): NormalizedConversation | null {
  const customer = c.participants?.data.find((p) => p.id !== businessId);
  if (!customer) return null;
  const name = customer.name ?? (customer.username ? `@${customer.username}` : "Customer");
  const messages: NormalizedMessage[] = (c.messages?.data ?? [])
    .map((m) => ({ externalId: m.id, authorExternalId: m.from?.id === businessId ? "me" : customer.id, authorName: m.from?.id === businessId ? undefined : name, sentAt: new Date(m.created_time).toISOString(), body: m.message ?? "", attachments: [] }))
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  return {
    externalId: customer.id,
    kind: "dm",
    title: name,
    participants: [{ externalId: customer.id, name, handle: customer.username ? `@${customer.username}` : undefined }],
    unreadCount: c.unread_count ?? 0,
    lastMessageAt: new Date(c.updated_time).toISOString(),
    externalUrl: c.link ? `https://www.facebook.com${c.link}` : undefined,
    messages,
  };
}

async function messengerPages(code: string, redirectUri: string): Promise<ConnectedIdentity[]> {
  const short = await metaFetch<{ access_token: string }>(`${FB()}/oauth/access_token?${qs({ client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, redirect_uri: redirectUri, code })}`, { label: "facebook token" });
  // Long-lived user token → Page tokens that don't expire.
  const long = await metaFetch<{ access_token: string }>(`${FB()}/oauth/access_token?${qs({ grant_type: "fb_exchange_token", client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, fb_exchange_token: short.access_token })}`, { label: "facebook long-lived token" });
  const pages = await metaFetch<{ data: { id: string; name: string; access_token: string; tasks?: string[] }[] }>(`${FB()}/me/accounts?${qs({ fields: "id,name,access_token,tasks", access_token: long.access_token })}`, { label: "pages" });
  const out: ConnectedIdentity[] = [];
  for (const p of pages.data.filter((x) => !x.tasks || x.tasks.includes("MESSAGING") || x.tasks.includes("MODERATE"))) {
    // Subscribe the Page to this app's webhooks.
    await metaFetch(`${FB()}/${p.id}/subscribed_apps?${qs({ subscribed_fields: "messages,message_echoes", access_token: p.access_token })}`, { label: "subscribe page", method: "POST" });
    out.push({ externalAccountId: p.id, handle: p.name, label: p.name, scopes: MESSENGER_SCOPES, tokens: { accessToken: p.access_token, extra: { pageId: p.id } } });
  }
  return out;
}


/* ------------------------------------------------------------------ Instagram (professional accounts) */

export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"];

export const InstagramConnector: Connector = {
  platform: "instagram",
  isConfigured: () => !!(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET),

  getAuthorizationUrl(state, redirectUri) {
    return `https://www.instagram.com/oauth/authorize?${qs({ client_id: process.env.INSTAGRAM_APP_ID!, redirect_uri: redirectUri, response_type: "code", scope: INSTAGRAM_SCOPES.join(","), state })}`;
  },

  async exchangeCode(code, redirectUri): Promise<ConnectedIdentity> {
    const form = new URLSearchParams({ client_id: process.env.INSTAGRAM_APP_ID!, client_secret: process.env.INSTAGRAM_APP_SECRET!, grant_type: "authorization_code", redirect_uri: redirectUri, code });
    const short = await metaFetch<{ access_token: string; user_id: number | string }>("https://api.instagram.com/oauth/access_token", { label: "instagram token", method: "POST", body: form });
    const long = await metaFetch<{ access_token: string; expires_in: number }>(`https://graph.instagram.com/access_token?${qs({ grant_type: "ig_exchange_token", client_secret: process.env.INSTAGRAM_APP_SECRET!, access_token: short.access_token })}`, { label: "instagram long-lived token" });
    const me = await metaFetch<{ user_id: string; username: string; account_type?: string }>(`${IG()}/me?${qs({ fields: "user_id,username,account_type", access_token: long.access_token })}`, { label: "instagram me" });
    // Subscribe this professional account to message webhooks.
    await metaFetch(`${IG()}/me/subscribed_apps?${qs({ subscribed_fields: "messages", access_token: long.access_token })}`, { label: "subscribe instagram", method: "POST" }).catch(() => undefined);
    return {
      externalAccountId: String(me.user_id),
      handle: `@${me.username}`,
      label: me.account_type === "MEDIA_CREATOR" ? "Creator" : "Business",
      scopes: INSTAGRAM_SCOPES,
      tokens: { accessToken: long.access_token, expiresAt: Date.now() + long.expires_in * 1000, extra: { igUserId: String(me.user_id) } },
    };
  },

  /** Long-lived Instagram tokens last 60 days and can be refreshed after 24 hours. */
  async refresh(tokens) {
    const r = await metaFetch<{ access_token: string; expires_in: number }>(`https://graph.instagram.com/refresh_access_token?${qs({ grant_type: "ig_refresh_token", access_token: tokens.accessToken })}`, { label: "instagram refresh" });
    return { ...tokens, accessToken: r.access_token, expiresAt: Date.now() + r.expires_in * 1000 };
  },

  async listConversations(ctx, cursor) {
    const igId = ctx.tokens.extra?.igUserId ?? "";
    // Instagram only returns the 20 most recent messages per conversation.
    const url = cursor ?? `${IG()}/me/conversations?${qs({ platform: "instagram", fields: "id,updated_time,participants,messages.limit(20){id,created_time,from,message}", access_token: ctx.tokens.accessToken })}`;
    const r = await metaFetch<{ data: FbConversation[]; paging?: { next?: string } }>(url, { label: "instagram conversations" });
    return { items: r.data.map((c) => fbConversation(c, igId)).filter(Boolean) as NormalizedConversation[], nextCursor: r.paging?.next };
  },

  async listMessages() {
    return { items: [] };
  },

  async send(ctx, msg) {
    return pageOrIgSend(`${IG()}/me/messages`, ctx, msg, "instagram");
  },
};

async function pageOrIgSend(url: string, ctx: ConnectorContext, msg: Parameters<Connector["send"]>[1], platform: "messenger" | "instagram") {
  if (!msg.externalConversationId) throw new ConnectorError("Businesses can only reply to people who messaged them first.", false);
  if (msg.attachments?.length) throw new ConnectorError(`Sending files on ${platform === "instagram" ? "Instagram" : "Messenger"} isn't supported in Orbit yet.`, false);
  const mode = replyMode(msg.lastCustomerMessageAt, Date.now(), process.env.META_HUMAN_AGENT_ENABLED === "true");
  if (!mode.ok) throw new ConnectorError(mode.reason, false);
  const body = { recipient: { id: msg.externalConversationId }, message: { text: msg.body }, ...(mode.tag ? { messaging_type: "MESSAGE_TAG", tag: mode.tag } : { messaging_type: "RESPONSE" }) };
  const r = await metaFetch<{ message_id: string; recipient_id: string }>(`${url}?${qs({ access_token: ctx.tokens.accessToken })}`, { label: `${platform} send`, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { externalMessageId: r.message_id, externalConversationId: msg.externalConversationId, sentAt: new Date().toISOString() };
}

/* ------------------------------------------------------------------ WhatsApp Business (Cloud API) */

export const WhatsAppConnector: Connector = {
  platform: "whatsapp",
  // Connected with a system-user token + phone number id (see /api/connectors/whatsapp/connect).
  isConfigured: () => !!process.env.META_APP_SECRET,

  // The Cloud API has no message history endpoint; conversations come from webhooks.
  async listConversations() {
    return { items: [] };
  },
  async listMessages() {
    return { items: [] };
  },

  attachmentLimits: { perFile: 16 * 1024 * 1024, total: 16 * 1024 * 1024 },

  async send(ctx, msg) {
    if (!msg.externalConversationId) throw new ConnectorError("Businesses can only message people who wrote first (or with an approved template).", false);
    const phoneId = ctx.tokens.extra?.phoneNumberId;
    const mode = replyMode(msg.lastCustomerMessageAt, Date.now(), false);
    if (!mode.ok) throw new ConnectorError(mode.reason, false);
    const headers = { authorization: `Bearer ${ctx.tokens.accessToken}`, "content-type": "application/json" };
    let lastId = "";
    if (msg.body.trim()) {
      const r = await metaFetch<{ messages: { id: string }[] }>(`${FB()}/${phoneId}/messages`, { label: "whatsapp send", method: "POST", headers, body: JSON.stringify({ messaging_product: "whatsapp", to: msg.externalConversationId, type: "text", text: { body: msg.body } }) });
      lastId = r.messages[0]?.id ?? "";
    }
    for (const f of msg.attachments ?? []) {
      const form = new FormData();
      form.set("messaging_product", "whatsapp");
      form.set("file", new Blob([new Uint8Array(f.data)], { type: f.mimeType }), f.name);
      const up = await metaFetch<{ id: string }>(`${FB()}/${phoneId}/media`, { label: "whatsapp media upload", method: "POST", headers: { authorization: headers.authorization }, body: form });
      const r = await metaFetch<{ messages: { id: string }[] }>(`${FB()}/${phoneId}/messages`, { label: "whatsapp send media", method: "POST", headers, body: JSON.stringify({ messaging_product: "whatsapp", to: msg.externalConversationId, type: "document", document: { id: up.id, filename: f.name } }) });
      lastId = r.messages[0]?.id ?? lastId;
    }
    if (!lastId) throw new ConnectorError("Nothing to send.", false);
    return { externalMessageId: lastId, externalConversationId: msg.externalConversationId, sentAt: new Date().toISOString() };
  },

  async downloadAttachment(ctx, _messageId, att) {
    if (!att.externalId) throw new ConnectorError("This media can't be downloaded.", false);
    const meta = await metaFetch<{ url: string; mime_type: string }>(`${FB()}/${att.externalId}`, { label: "whatsapp media", headers: { authorization: `Bearer ${ctx.tokens.accessToken}` } });
    const res = await providerFetch(meta.url, { label: "whatsapp media download", headers: { authorization: `Bearer ${ctx.tokens.accessToken}` } });
    if (!res.ok) throw new ConnectorError(`Couldn't download media (${res.status})`, false);
    return { data: Buffer.from(await res.arrayBuffer()), mimeType: meta.mime_type || att.mimeType, name: att.name };
  },
};

/** Validates a WhatsApp Cloud API token + phone number id and returns the identity to store. */
export async function whatsappIdentity(token: string, phoneNumberId: string): Promise<ConnectedIdentity> {
  const p = await metaFetch<{ id: string; display_phone_number: string; verified_name?: string }>(`${FB()}/${encodeURIComponent(phoneNumberId)}?${qs({ fields: "id,display_phone_number,verified_name" })}`, { label: "whatsapp phone number", headers: { authorization: `Bearer ${token}` } });
  return { externalAccountId: p.id, handle: p.display_phone_number, label: p.verified_name ?? "Business", scopes: ["whatsapp_business_messaging"], tokens: { accessToken: token, extra: { phoneNumberId: p.id } } };
}
