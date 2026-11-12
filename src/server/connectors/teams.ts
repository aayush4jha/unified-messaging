import { htmlToText } from "./gmail";
import {
  AuthError,
  ConnectorError,
  providerFetch,
  type ConnectedIdentity,
  type Connector,
  type ConnectorContext,
  type NormalizedConversation,
  type NormalizedMessage,
  type TokenSet,
} from "./types";

/**
 * Microsoft Teams chats connector (Microsoft Graph, delegated).
 *
 * Work/school accounts only (Graph doesn't support consumer Teams). Microsoft
 * limits *polling* chat messages to once per day, so Teams relies on change
 * notifications (/me/chats/getAllMessages, max 3 days, renewed daily) and syncs
 * on push; the cron's catch-up poll for Teams runs at most daily.
 */

export const TEAMS_SCOPES = ["offline_access", "openid", "profile", "email", "User.Read", "Chat.ReadWrite", "ChatMessage.Send"];
const AUTHORITY = "https://login.microsoftonline.com/organizations/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";

/* ------------------------------------------------------------------ pure helpers (unit-tested) */

export interface TeamsMember {
  userId?: string;
  displayName?: string;
  email?: string;
}
export interface TeamsChat {
  id: string;
  topic?: string | null;
  chatType: "oneOnOne" | "group" | "meeting";
  webUrl?: string;
  members?: TeamsMember[];
  lastMessagePreview?: { createdDateTime?: string; body?: { content?: string }; from?: { user?: { id?: string; displayName?: string } } } | null;
  viewpoint?: { lastMessageReadDateTime?: string } | null;
}
export interface TeamsMessage {
  id: string;
  messageType?: string;
  createdDateTime: string;
  deletedDateTime?: string | null;
  from?: { user?: { id?: string; displayName?: string } | null } | null;
  body?: { contentType?: "text" | "html"; content?: string };
  attachments?: { id: string; name?: string | null; contentType?: string; contentUrl?: string | null }[];
  replyToId?: string | null;
}

export function normalizeTeamsChat(chat: TeamsChat, selfId: string): NormalizedConversation {
  const others = (chat.members ?? []).filter((m) => m.userId && m.userId !== selfId);
  const title = chat.topic?.trim() || others.map((m) => m.displayName ?? m.email ?? "Unknown").join(", ") || "Chat";
  const last = chat.lastMessagePreview?.createdDateTime;
  const readUpTo = chat.viewpoint?.lastMessageReadDateTime;
  const fromOther = chat.lastMessagePreview?.from?.user?.id && chat.lastMessagePreview.from.user.id !== selfId;
  return {
    externalId: chat.id,
    kind: chat.chatType === "oneOnOne" ? "dm" : "group",
    title,
    participants: others.map((m) => ({ externalId: m.userId!, name: m.displayName ?? m.email ?? "Unknown", handle: m.email })),
    unreadCount: fromOther && last && (!readUpTo || readUpTo < last) ? 1 : 0,
    lastMessageAt: last ?? new Date(0).toISOString(),
    externalUrl: chat.webUrl,
  };
}

export function normalizeTeamsMessage(m: TeamsMessage, selfId: string): NormalizedMessage | null {
  if (m.messageType && m.messageType !== "message") return null; // system events (member added, call ended…)
  if (m.deletedDateTime) return null;
  const mine = m.from?.user?.id === selfId;
  const raw = m.body?.content ?? "";
  return {
    externalId: m.id,
    authorExternalId: mine ? "me" : (m.from?.user?.id ?? "unknown"),
    authorName: mine ? undefined : (m.from?.user?.displayName ?? "Unknown"),
    sentAt: new Date(m.createdDateTime).toISOString(),
    body: m.body?.contentType === "html" ? htmlToText(raw.replace(/<attachment[^>]*><\/attachment>/g, "")) : raw,
    attachments: (m.attachments ?? []).filter((a) => a.contentType === "reference" && a.name).map((a) => ({ externalId: a.contentUrl ?? a.id, name: a.name!, mimeType: "application/octet-stream", size: 0 })),
    threadExternalId: m.replyToId ?? undefined,
  };
}

/* ------------------------------------------------------------------ API */

async function tokenRequest(body: Record<string, string>, label: string): Promise<Record<string, unknown>> {
  const res = await providerFetch(`${AUTHORITY}/token`, {
    label,
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.MICROSOFT_CLIENT_ID!, client_secret: process.env.MICROSOFT_CLIENT_SECRET!, scope: TEAMS_SCOPES.join(" "), ...body }),
  });
  const tok = await res.json();
  if (tok.error === "invalid_grant") throw new AuthError("Microsoft access was revoked or expired. Reconnect Teams.");
  if (tok.error === "consent_required" || tok.error === "interaction_required") throw new AuthError("Your organization requires an admin to approve Orbit for Teams.");
  if (!res.ok || !tok.access_token) throw new ConnectorError(`Microsoft sign-in failed: ${tok.error_description ?? tok.error ?? res.status}`, false);
  return tok;
}

async function ensureFresh(ctx: ConnectorContext): Promise<TokenSet> {
  if (ctx.tokens.expiresAt && ctx.tokens.expiresAt - 60_000 < Date.now() && ctx.tokens.refreshToken) {
    const next = await TeamsConnector.refresh!(ctx.tokens);
    await ctx.saveTokens(next);
    ctx.tokens = next;
  }
  return ctx.tokens;
}

async function graph<T>(ctx: ConnectorContext, pathOrUrl: string, init: RequestInit = {}, label = "graph"): Promise<T> {
  const tokens = await ensureFresh(ctx);
  const res = await providerFetch(pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH}${pathOrUrl}`, {
    ...init,
    label,
    headers: { authorization: `Bearer ${tokens.accessToken}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 403) throw new AuthError("Teams access was denied. Reconnect, or ask an admin to approve Orbit's chat permissions.");
  if (!res.ok) throw new ConnectorError(`Teams ${label} failed (${res.status})`, false);
  if (res.status === 201 || res.status === 200) return (await res.json()) as T;
  return {} as T;
}

const selfId = (ctx: ConnectorContext) => ctx.tokens.extra?.userId ?? "";

export const TeamsConnector: Connector = {
  platform: "teams",
  isConfigured: () => !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),

  getAuthorizationUrl(state, redirectUri) {
    const p = new URLSearchParams({ client_id: process.env.MICROSOFT_CLIENT_ID!, response_type: "code", redirect_uri: redirectUri, response_mode: "query", scope: TEAMS_SCOPES.join(" "), state, prompt: "select_account" });
    return `${AUTHORITY}/authorize?${p}`;
  },

  async exchangeCode(code, redirectUri): Promise<ConnectedIdentity> {
    const tok = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" }, "microsoft token");
    const me = await (await providerFetch(`${GRAPH}/me?$select=id,displayName,mail,userPrincipalName`, { label: "graph me", headers: { authorization: `Bearer ${tok.access_token}` } })).json();
    const org = await (await providerFetch(`${GRAPH}/organization?$select=id,displayName`, { label: "graph organization", headers: { authorization: `Bearer ${tok.access_token}` } })).json().catch(() => ({ value: [] }));
    const tenant = org.value?.[0];
    return {
      externalAccountId: me.id,
      handle: String(me.mail ?? me.userPrincipalName ?? "").toLowerCase(),
      label: tenant?.displayName ?? "Teams",
      scopes: String(tok.scope ?? "").split(" "),
      tokens: {
        accessToken: String(tok.access_token),
        refreshToken: tok.refresh_token as string | undefined,
        expiresAt: Date.now() + Number(tok.expires_in ?? 3600) * 1000,
        extra: { userId: me.id, tenantId: tenant?.id ?? "" },
      },
    };
  },

  async refresh(tokens) {
    const tok = await tokenRequest({ refresh_token: tokens.refreshToken!, grant_type: "refresh_token" }, "microsoft refresh");
    return { ...tokens, accessToken: String(tok.access_token), refreshToken: (tok.refresh_token as string | undefined) ?? tokens.refreshToken, expiresAt: Date.now() + Number(tok.expires_in ?? 3600) * 1000 };
  },

  async listConversations(ctx, cursor) {
    const url = cursor ?? `/me/chats?$expand=members&$top=50&$orderby=lastMessagePreview/createdDateTime desc&$select=id,topic,chatType,webUrl,lastMessagePreview,viewpoint`;
    const r = await graph<{ value: TeamsChat[]; "@odata.nextLink"?: string }>(ctx, url, {}, "list chats");
    const items = r.value.filter((c) => c.lastMessagePreview).map((c) => normalizeTeamsChat(c, selfId(ctx)));
    return { items, nextCursor: r["@odata.nextLink"] };
  },

  async listMessages(ctx, chatId, cursor) {
    const r = await graph<{ value: TeamsMessage[]; "@odata.nextLink"?: string }>(ctx, cursor ?? `/me/chats/${encodeURIComponent(chatId)}/messages?$top=50`, {}, "chat messages");
    const items = r.value.map((m) => normalizeTeamsMessage(m, selfId(ctx))).filter((m): m is NormalizedMessage => !!m);
    return { items: items.sort((a, b) => a.sentAt.localeCompare(b.sentAt)), nextCursor: r["@odata.nextLink"] };
  },

  async send(ctx, msg) {
    let chatId = msg.externalConversationId;
    if (!chatId) {
      // New 1:1 chat by email (Graph binds members by user principal name / email).
      if (msg.to.length !== 1) throw new ConnectorError("Start a Teams chat with one person at a time.", false);
      const chat = await graph<{ id: string }>(ctx, "/chats", {
        method: "POST",
        body: JSON.stringify({
          chatType: "oneOnOne",
          members: [
            { "@odata.type": "#microsoft.graph.aadUserConversationMember", roles: ["owner"], "user@odata.bind": `${GRAPH}/users('${selfId(ctx)}')` },
            { "@odata.type": "#microsoft.graph.aadUserConversationMember", roles: ["owner"], "user@odata.bind": `${GRAPH}/users('${encodeURIComponent(msg.to[0])}')` },
          ],
        }),
      }, "create chat");
      chatId = chat.id;
    }
    const sent = await graph<{ id: string; createdDateTime: string }>(ctx, `/chats/${encodeURIComponent(chatId)}/messages`, { method: "POST", body: JSON.stringify({ body: { contentType: "text", content: msg.body } }) }, "send message");
    return { externalMessageId: sent.id, externalConversationId: chatId, sentAt: new Date(sent.createdDateTime ?? Date.now()).toISOString() };
  },

  async markRead(ctx, chatId) {
    await graph(ctx, `/chats/${encodeURIComponent(chatId)}/markChatReadForUser`, { method: "POST", body: JSON.stringify({ user: { id: selfId(ctx), tenantId: ctx.tokens.extra?.tenantId } }) }, "mark read");
  },

  /** Push for all of this user's chats. Chat message subscriptions last at most 3 days; renewed daily. */
  async subscribe(ctx, { notificationUrl, secret, existing }) {
    const ex = existing as { id?: string; expiresAt?: number } | undefined;
    if (ex?.id && (ex.expiresAt ?? 0) - Date.now() > 24 * 3_600_000) return ex;
    const expirationDateTime = new Date(Date.now() + 70 * 3_600_000).toISOString();
    if (ex?.id) {
      try {
        await graph(ctx, `/subscriptions/${ex.id}`, { method: "PATCH", body: JSON.stringify({ expirationDateTime }) }, "renew subscription");
        return { id: ex.id, expiresAt: Date.parse(expirationDateTime) };
      } catch {
        // fall through and recreate
      }
    }
    const sub = await graph<{ id: string; expirationDateTime: string }>(ctx, "/subscriptions", {
      method: "POST",
      body: JSON.stringify({ changeType: "created,updated", notificationUrl, resource: `/users/${selfId(ctx)}/chats/getAllMessages`, expirationDateTime, clientState: secret, latestSupportedTlsVersion: "v1_2" }),
    }, "create subscription");
    return { id: sub.id, expiresAt: Date.parse(sub.expirationDateTime) };
  },

  /** Microsoft only allows polling Teams chats once per day; push-triggered syncs aren't limited. */
  minPollIntervalMs: 24 * 3_600_000,
};
