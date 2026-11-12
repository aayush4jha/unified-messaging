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
import { stripQuotedReply } from "./gmail";

/**
 * Outlook / Microsoft 365 connector (Microsoft Graph v1.0, delegated permissions).
 *
 * Scopes: Mail.ReadWrite (read, mark read, move to Archive) + Mail.Send + User.Read.
 * Works for personal (Outlook.com) and work/school accounts. Some organizations
 * only allow consent to publisher-verified apps.
 */

export const MS_SCOPES = ["offline_access", "openid", "profile", "email", "User.Read", "Mail.ReadWrite", "Mail.Send"];
const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";
const SELECT = "id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,bodyPreview,body,hasAttachments,parentFolderId,internetMessageId,importance,flag,webLink";

/* ------------------------------------------------------------------ pure helpers (unit-tested) */

export interface GraphAddress {
  emailAddress?: { name?: string; address?: string };
}
export interface GraphMessage {
  id: string;
  conversationId: string;
  subject?: string | null;
  from?: GraphAddress;
  toRecipients?: GraphAddress[];
  ccRecipients?: GraphAddress[];
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  bodyPreview?: string;
  body?: { contentType: "text" | "html"; content: string };
  hasAttachments?: boolean;
  parentFolderId?: string;
  internetMessageId?: string;
  importance?: "low" | "normal" | "high";
  flag?: { flagStatus?: "notFlagged" | "flagged" | "complete" };
  webLink?: string;
}

const addr = (a?: GraphAddress) => ({ name: a?.emailAddress?.name?.trim() || a?.emailAddress?.address || "Unknown", email: (a?.emailAddress?.address ?? "").toLowerCase() });

export function normalizeGraphMessage(m: GraphMessage, ownerEmail: string): NormalizedMessage {
  const from = addr(m.from);
  const mine = !!from.email && from.email === ownerEmail.toLowerCase();
  const text = m.body?.contentType === "text" ? m.body.content : (m.bodyPreview ?? "");
  return {
    externalId: m.id,
    authorExternalId: mine ? "me" : from.email || "unknown",
    authorName: mine ? undefined : from.name,
    sentAt: new Date(m.sentDateTime ?? m.receivedDateTime ?? 0).toISOString(),
    subject: m.subject ?? undefined,
    body: stripQuotedReply(text.replace(/\r\n/g, "\n")).trim() || (m.bodyPreview ?? ""),
    to: (m.toRecipients ?? []).map((a) => addr(a).email).filter(Boolean),
    cc: (m.ccRecipients ?? []).map((a) => addr(a).email).filter(Boolean),
    attachments: [],
    threadExternalId: m.conversationId,
    metadata: { internetMessageId: m.internetMessageId, hasAttachments: m.hasAttachments, folderId: m.parentFolderId },
  };
}

/** Groups Graph messages into conversations by conversationId. */
export function groupGraphConversations(messages: GraphMessage[], ownerEmail: string, inboxFolderId?: string): NormalizedConversation[] {
  const byConv = new Map<string, GraphMessage[]>();
  for (const m of messages) byConv.set(m.conversationId, [...(byConv.get(m.conversationId) ?? []), m]);
  const owner = ownerEmail.toLowerCase();
  return [...byConv.entries()]
    .map(([conversationId, ms]) => {
      const sorted = [...ms].sort((a, b) => (a.sentDateTime ?? a.receivedDateTime ?? "").localeCompare(b.sentDateTime ?? b.receivedDateTime ?? ""));
      const participants = new Map<string, { externalId: string; name: string; handle: string }>();
      for (const m of sorted) {
        for (const a of [m.from, ...(m.toRecipients ?? []), ...(m.ccRecipients ?? [])]) {
          const x = addr(a);
          if (x.email && x.email !== owner && !participants.has(x.email)) participants.set(x.email, { externalId: x.email, name: x.name, handle: x.email });
        }
      }
      const normalized = sorted.map((m) => normalizeGraphMessage(m, ownerEmail));
      const subject = sorted.find((m) => m.subject)?.subject ?? "(no subject)";
      return {
        externalId: conversationId,
        kind: "email" as const,
        title: subject.replace(/^(re|fw|fwd):\s*/i, ""),
        participants: [...participants.values()],
        unreadCount: sorted.filter((m) => m.isRead === false).length,
        lastMessageAt: normalized[normalized.length - 1]?.sentAt ?? new Date(0).toISOString(),
        externalUrl: sorted[sorted.length - 1]?.webLink,
        messages: normalized,
        metadata: {
          archived: inboxFolderId ? !sorted.some((m) => m.parentFolderId === inboxFolderId) : undefined,
          starred: sorted.some((m) => m.flag?.flagStatus === "flagged"),
          important: sorted.some((m) => m.importance === "high"),
        },
      };
    })
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

export function isPersonalMicrosoftAddress(email: string): boolean {
  return /@(outlook|hotmail|live|msn)\.[a-z.]+$/i.test(email);
}

/* ------------------------------------------------------------------ API */

async function ensureFresh(ctx: ConnectorContext): Promise<TokenSet> {
  if (ctx.tokens.expiresAt && ctx.tokens.expiresAt - 60_000 < Date.now() && ctx.tokens.refreshToken) {
    const next = await OutlookConnector.refresh!(ctx.tokens);
    await ctx.saveTokens(next);
    ctx.tokens = next;
  }
  return ctx.tokens;
}

async function graph<T = Record<string, unknown>>(ctx: ConnectorContext, pathOrUrl: string, init: RequestInit = {}, label = "graph"): Promise<T> {
  const tokens = await ensureFresh(ctx);
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH}${pathOrUrl}`;
  const res = await providerFetch(url, {
    ...init,
    label,
    headers: { authorization: `Bearer ${tokens.accessToken}`, "content-type": "application/json", prefer: 'outlook.body-content-type="text"', ...(init.headers ?? {}) },
  });
  if (res.status === 403) throw new AuthError("Microsoft denied access. Reconnect and grant all requested permissions (your organization may require admin approval).");
  if (res.status === 404) throw new ConnectorError(`${label}: not found`, false);
  if (!res.ok) throw new ConnectorError(`${label} failed (${res.status})`, false);
  if (res.status === 202 || res.status === 204) return {} as T;
  return (await res.json()) as T;
}

async function folderId(ctx: ConnectorContext, wellKnown: "inbox" | "archive" | "sentitems"): Promise<string | undefined> {
  try {
    return (await graph<{ id: string }>(ctx, `/me/mailFolders/${wellKnown}?$select=id`, {}, `folder ${wellKnown}`)).id;
  } catch (e) {
    if (e instanceof ConnectorError && !e.retryable && !(e instanceof AuthError)) return undefined; // e.g. no Archive folder yet
    throw e;
  }
}

async function tokenRequest(body: Record<string, string>, label: string): Promise<Record<string, unknown>> {
  const res = await providerFetch(`${AUTHORITY}/token`, {
    label,
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.MICROSOFT_CLIENT_ID!, client_secret: process.env.MICROSOFT_CLIENT_SECRET!, scope: MS_SCOPES.join(" "), ...body }),
  });
  const tok = await res.json();
  if (tok.error === "invalid_grant") throw new AuthError("Microsoft access was revoked or expired. Reconnect this account.");
  if (!res.ok || !tok.access_token) throw new ConnectorError(`Microsoft sign-in failed: ${tok.error_description ?? tok.error ?? res.status}`, false);
  return tok;
}

export const OutlookConnector: Connector = {
  platform: "outlook",
  isConfigured: () => !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),

  getAuthorizationUrl(state, redirectUri) {
    const p = new URLSearchParams({ client_id: process.env.MICROSOFT_CLIENT_ID!, response_type: "code", redirect_uri: redirectUri, response_mode: "query", scope: MS_SCOPES.join(" "), state, prompt: "select_account" });
    return `${AUTHORITY}/authorize?${p}`;
  },

  async exchangeCode(code, redirectUri): Promise<ConnectedIdentity> {
    const tok = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" }, "microsoft token");
    const granted = String(tok.scope ?? "").split(" ").map((s) => s.replace("https://graph.microsoft.com/", ""));
    if (!granted.some((s) => /^Mail\.ReadWrite$/i.test(s))) throw new ConnectorError("Mail access wasn't granted. Please allow all requested permissions.", false);
    const me = await (await providerFetch(`${GRAPH}/me?$select=id,displayName,mail,userPrincipalName`, { label: "graph me", headers: { authorization: `Bearer ${tok.access_token}` } })).json();
    const email = String(me.mail ?? me.userPrincipalName ?? "").toLowerCase();
    return {
      externalAccountId: me.id,
      handle: email,
      label: isPersonalMicrosoftAddress(email) ? "Personal" : (email.split("@")[1]?.split(".")[0] ?? "Work"),
      scopes: granted,
      tokens: { accessToken: String(tok.access_token), refreshToken: tok.refresh_token as string | undefined, expiresAt: Date.now() + Number(tok.expires_in ?? 3600) * 1000, scope: String(tok.scope ?? "") },
    };
  },

  async refresh(tokens) {
    const tok = await tokenRequest({ refresh_token: tokens.refreshToken!, grant_type: "refresh_token" }, "microsoft refresh");
    return { ...tokens, accessToken: String(tok.access_token), refreshToken: (tok.refresh_token as string | undefined) ?? tokens.refreshToken, expiresAt: Date.now() + Number(tok.expires_in ?? 3600) * 1000 };
  },

  // Microsoft has no per-app token revocation endpoint. Orbit deletes its copy of the tokens on
  // disconnect; users can also remove the app at account.microsoft.com (or My Apps for work accounts).

  async listConversations(ctx, cursor) {
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const inbox = await folderId(ctx, "inbox");
    const archive = await folderId(ctx, "archive");
    const page = (folder: string) => `/me/mailFolders/${folder}/messages?$top=50&$orderby=receivedDateTime desc&$filter=receivedDateTime ge ${since}&$select=${SELECT}`;
    const urls: string[] = cursor ? JSON.parse(cursor) : [page("inbox"), page("sentitems"), ...(archive ? [page("archive")] : [])];
    const all: GraphMessage[] = [];
    const next: string[] = [];
    for (const u of urls) {
      const r = await graph<{ value: GraphMessage[]; "@odata.nextLink"?: string }>(ctx, u, {}, "list messages");
      all.push(...r.value);
      if (r["@odata.nextLink"]) next.push(r["@odata.nextLink"]);
    }
    return { items: groupGraphConversations(all, ctx.accountHandle, inbox), nextCursor: next.length ? JSON.stringify(next) : undefined };
  },

  async listMessages(ctx, conversationId) {
    const r = await graph<{ value: GraphMessage[] }>(ctx, `/me/messages?$top=100&$filter=conversationId eq '${conversationId.replace(/'/g, "''")}'&$select=${SELECT}`, {}, "conversation messages");
    return { items: groupGraphConversations(r.value, ctx.accountHandle)[0]?.messages ?? [] };
  },

  async send(ctx, msg) {
    const recipients = (xs?: string[]) => (xs ?? []).map((address) => ({ emailAddress: { address } }));
    // Draft first (returns ids), then send: Graph's sendMail returns no id to track.
    const draft = msg.inReplyTo
      ? await graph<{ id: string; conversationId: string }>(ctx, `/me/messages/${encodeURIComponent(msg.inReplyTo.messageExternalId)}/createReply`, {
          method: "POST",
          body: JSON.stringify({ message: { body: { contentType: "Text", content: msg.body }, toRecipients: recipients(msg.to), ccRecipients: recipients(msg.cc) } }),
        }, "createReply")
      : await graph<{ id: string; conversationId: string }>(ctx, "/me/messages", {
          method: "POST",
          body: JSON.stringify({ subject: msg.subject ?? "", body: { contentType: "Text", content: msg.body }, toRecipients: recipients(msg.to), ccRecipients: recipients(msg.cc) }),
        }, "create draft");
    await graph(ctx, `/me/messages/${encodeURIComponent(draft.id)}/send`, { method: "POST" }, "send");
    return { externalMessageId: draft.id, externalConversationId: draft.conversationId, sentAt: new Date().toISOString() };
  },

  async markRead(ctx, conversationId) {
    const r = await graph<{ value: { id: string }[] }>(ctx, `/me/messages?$top=50&$filter=conversationId eq '${conversationId.replace(/'/g, "''")}' and isRead eq false&$select=id`, {}, "unread in conversation");
    for (const m of r.value) await graph(ctx, `/me/messages/${encodeURIComponent(m.id)}`, { method: "PATCH", body: JSON.stringify({ isRead: true }) }, "mark read");
  },

  async archive(ctx, conversationId, archived) {
    const from = await folderId(ctx, archived ? "inbox" : "archive");
    if (!from) return;
    const r = await graph<{ value: { id: string }[] }>(ctx, `/me/mailFolders/${from}/messages?$top=100&$filter=conversationId eq '${conversationId.replace(/'/g, "''")}'&$select=id`, {}, "messages to move");
    for (const m of r.value) await graph(ctx, `/me/messages/${encodeURIComponent(m.id)}/move`, { method: "POST", body: JSON.stringify({ destinationId: archived ? "archive" : "inbox" }) }, "move");
  },
};
