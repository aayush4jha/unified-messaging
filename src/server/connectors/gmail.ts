import {
  AuthError,
  ConnectorError,
  providerFetch,
  type ConnectedIdentity,
  type Connector,
  type ConnectorContext,
  type NormalizedAttachment,
  type NormalizedConversation,
  type NormalizedMessage,
  type OutboundMessage,
  type TokenSet,
} from "./types";

/**
 * Gmail connector (Gmail API v1 + Google OAuth 2.0).
 *
 * Scopes: gmail.modify (read, label, archive, mark read) + gmail.send.
 * gmail.modify is a *restricted* scope: production use needs Google
 * verification + CASA assessment; until then only test users can connect.
 */

export const GMAIL_SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.send"];

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

/* ------------------------------------------------------------------ pure helpers (unit-tested) */

export function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export function encodeBase64Url(data: string | Buffer): string {
  return Buffer.from(data).toString("base64url");
}

export interface GmailHeader {
  name: string;
  value: string;
}
export interface GmailPart {
  partId?: string;
  mimeType: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
}
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

export function header(headers: GmailHeader[] | undefined, name: string): string | undefined {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

/** "Rahul Mehta <rahul@x.io>" -> { name: "Rahul Mehta", email: "rahul@x.io" } */
export function parseAddress(raw: string): { name: string; email: string } {
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || m[2].trim(), email: m[2].trim().toLowerCase() };
  const email = raw.trim().toLowerCase();
  return { name: email, email };
}

export function splitAddresses(raw: string | undefined): string[] {
  if (!raw) return [];
  // Split on commas that aren't inside quotes.
  return raw.match(/("[^"]*"|[^,])+/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Strips the quoted history Gmail clients append to replies, keeping the new text. */
export function stripQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/);
  const cut = lines.findIndex((l, i) => /^On .+ wrote:$/.test(l.trim()) || (/^>/.test(l) && lines.slice(i).every((x) => !x.trim() || /^>/.test(x))));
  return (cut > 0 ? lines.slice(0, cut) : lines).join("\n").trimEnd();
}

export function extractBody(part: GmailPart | undefined): { text: string; html?: string; attachments: NormalizedAttachment[] } {
  const attachments: NormalizedAttachment[] = [];
  let text: string | undefined;
  let html: string | undefined;
  const walk = (p: GmailPart) => {
    if (p.filename && (p.body?.attachmentId || p.body?.size)) {
      attachments.push({ externalId: p.body?.attachmentId, name: p.filename, mimeType: p.mimeType, size: p.body?.size ?? 0 });
      return;
    }
    if (p.mimeType === "text/plain" && p.body?.data && text === undefined) text = decodeBase64Url(p.body.data);
    else if (p.mimeType === "text/html" && p.body?.data && html === undefined) html = decodeBase64Url(p.body.data);
    p.parts?.forEach(walk);
  };
  if (part) walk(part);
  return { text: (text ?? (html ? htmlToText(html) : "")).trim(), html, attachments };
}

export function normalizeGmailMessage(m: GmailMessage, ownerEmail: string): NormalizedMessage {
  const h = m.payload?.headers;
  const from = parseAddress(header(h, "From") ?? "");
  const { text, html, attachments } = extractBody(m.payload);
  const mine = from.email === ownerEmail.toLowerCase() || !!m.labelIds?.includes("SENT");
  const ts = m.internalDate ? Number(m.internalDate) : Date.parse(header(h, "Date") ?? "");
  return {
    externalId: m.id,
    authorExternalId: mine ? "me" : from.email,
    authorName: mine ? undefined : from.name,
    sentAt: new Date(Number.isFinite(ts) ? ts : 0).toISOString(),
    subject: header(h, "Subject"),
    body: stripQuotedReply(text) || m.snippet || "",
    bodyHtml: html,
    to: splitAddresses(header(h, "To")).map((a) => parseAddress(a).email),
    cc: splitAddresses(header(h, "Cc")).map((a) => parseAddress(a).email),
    attachments,
    threadExternalId: m.threadId,
    metadata: { messageIdHeader: header(h, "Message-ID") ?? header(h, "Message-Id"), references: header(h, "References"), labelIds: m.labelIds },
  };
}

export function normalizeGmailThread(thread: { id: string; messages?: GmailMessage[] }, ownerEmail: string): NormalizedConversation {
  const messages = (thread.messages ?? []).map((m) => normalizeGmailMessage(m, ownerEmail)).sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  const first = thread.messages?.[0];
  const subject = header(first?.payload?.headers, "Subject") || "(no subject)";
  const participants = new Map<string, { externalId: string; name: string; handle: string }>();
  for (const m of thread.messages ?? []) {
    const h = m.payload?.headers;
    for (const raw of [header(h, "From"), ...splitAddresses(header(h, "To")), ...splitAddresses(header(h, "Cc"))]) {
      if (!raw) continue;
      const a = parseAddress(raw);
      if (a.email && a.email !== ownerEmail.toLowerCase() && !participants.has(a.email)) participants.set(a.email, { externalId: a.email, name: a.name, handle: a.email });
    }
  }
  const unread = (thread.messages ?? []).filter((m) => m.labelIds?.includes("UNREAD")).length;
  const inInbox = (thread.messages ?? []).some((m) => m.labelIds?.includes("INBOX"));
  return {
    externalId: thread.id,
    kind: "email",
    title: subject.replace(/^(re|fwd?):\s*/i, ""),
    participants: [...participants.values()],
    unreadCount: unread,
    lastMessageAt: messages[messages.length - 1]?.sentAt ?? new Date().toISOString(),
    externalUrl: `https://mail.google.com/mail/u/${encodeURIComponent(ownerEmail)}/#all/${thread.id}`,
    messages,
    metadata: { archived: !inInbox, starred: (thread.messages ?? []).some((m) => m.labelIds?.includes("STARRED")), important: (thread.messages ?? []).some((m) => m.labelIds?.includes("IMPORTANT")) },
  };
}

/** RFC 2047 encoded-word for non-ASCII headers. */
export function encodeHeader(value: string): string {
  return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Builds an RFC 5322 message (plain text, UTF-8) for messages.send. */
export function buildRawEmail(msg: { from: string; to: string[]; cc?: string[]; subject: string; body: string; inReplyTo?: string; references?: string }): string {
  const lines = [
    `From: ${msg.from}`,
    `To: ${msg.to.join(", ")}`,
    ...(msg.cc?.length ? [`Cc: ${msg.cc.join(", ")}`] : []),
    `Subject: ${encodeHeader(msg.subject)}`,
    ...(msg.inReplyTo ? [`In-Reply-To: ${msg.inReplyTo}`, `References: ${[msg.references, msg.inReplyTo].filter(Boolean).join(" ")}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    (Buffer.from(msg.body, "utf8").toString("base64").match(/.{1,76}/g) ?? [""]).join("\r\n"),
  ];
  return lines.join("\r\n");
}

/* ------------------------------------------------------------------ connector */

async function gmailFetch(ctx: ConnectorContext, path: string, init: RequestInit = {}, label = "gmail"): Promise<Response> {
  const tokens = await ensureFresh(ctx);
  const res = await providerFetch(`${API}${path}`, {
    ...init,
    label,
    headers: { authorization: `Bearer ${tokens.accessToken}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason as string | undefined;
    if (reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") throw new ConnectorError("Gmail quota exceeded; will retry.", true);
    throw new AuthError(body?.error?.message ?? "Gmail denied access (403). Reconnect and grant all permissions.");
  }
  if (!res.ok) throw new ConnectorError(`Gmail ${label} failed (${res.status})`, false);
  return res;
}

async function ensureFresh(ctx: ConnectorContext): Promise<TokenSet> {
  if (ctx.tokens.expiresAt && ctx.tokens.expiresAt - 60_000 < Date.now() && ctx.tokens.refreshToken) {
    const next = await GmailConnector.refresh!(ctx.tokens);
    await ctx.saveTokens(next);
    ctx.tokens = next;
  }
  return ctx.tokens;
}

export const GmailConnector: Connector = {
  platform: "gmail",
  isConfigured: () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),

  getAuthorizationUrl(state, redirectUri) {
    const p = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GMAIL_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent select_account",
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  },

  async exchangeCode(code, redirectUri): Promise<ConnectedIdentity> {
    const res = await providerFetch("https://oauth2.googleapis.com/token", {
      label: "google token",
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    const tok = await res.json();
    if (!res.ok || !tok.access_token) throw new ConnectorError(`Google sign-in failed: ${tok.error_description ?? tok.error ?? res.status}`, false);
    const granted = String(tok.scope ?? "").split(" ");
    if (!granted.includes("https://www.googleapis.com/auth/gmail.modify")) throw new ConnectorError("Gmail access wasn't granted. Please allow all requested permissions.", false);
    const info = await (await providerFetch("https://openidconnect.googleapis.com/v1/userinfo", { label: "google userinfo", headers: { authorization: `Bearer ${tok.access_token}` } })).json();
    return {
      externalAccountId: info.sub,
      handle: info.email,
      label: info.email?.endsWith("@gmail.com") ? "Personal" : (info.hd ?? "Work"),
      scopes: granted,
      tokens: { accessToken: tok.access_token, refreshToken: tok.refresh_token, expiresAt: Date.now() + Number(tok.expires_in ?? 3600) * 1000, scope: tok.scope },
    };
  },

  async refresh(tokens) {
    const res = await providerFetch("https://oauth2.googleapis.com/token", {
      label: "google refresh",
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ refresh_token: tokens.refreshToken!, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, grant_type: "refresh_token" }),
    });
    const tok = await res.json();
    if (tok.error === "invalid_grant") throw new AuthError("Google access was revoked or expired. Reconnect this account.");
    if (!res.ok) throw new ConnectorError(`Token refresh failed (${res.status})`, true);
    return { ...tokens, accessToken: tok.access_token, expiresAt: Date.now() + Number(tok.expires_in ?? 3600) * 1000 };
  },

  async revoke(tokens) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.refreshToken ?? tokens.accessToken)}`, { method: "POST" }).catch(() => undefined);
  },

  async listConversations(ctx, cursor) {
    // Metadata-only list keeps quota use low (threads.list = 10 units); full threads fetched per id.
    const p = new URLSearchParams({ maxResults: "20", q: "newer_than:60d -in:spam -in:trash -category:promotions" });
    if (cursor) p.set("pageToken", cursor);
    const list = await (await gmailFetch(ctx, `/threads?${p}`, {}, "threads.list")).json();
    const items: NormalizedConversation[] = [];
    for (const t of (list.threads ?? []) as { id: string }[]) {
      const thread = await (await gmailFetch(ctx, `/threads/${t.id}?format=full`, {}, "threads.get")).json();
      items.push(normalizeGmailThread(thread, ctx.accountHandle));
    }
    return { items, nextCursor: list.nextPageToken };
  },

  async listMessages(ctx, threadId) {
    const thread = await (await gmailFetch(ctx, `/threads/${threadId}?format=full`, {}, "threads.get")).json();
    return { items: normalizeGmailThread(thread, ctx.accountHandle).messages ?? [] };
  },

  async send(ctx, msg: OutboundMessage) {
    const raw = buildRawEmail({
      from: ctx.accountHandle,
      to: msg.to,
      cc: msg.cc,
      subject: msg.subject ?? "",
      body: msg.body,
      inReplyTo: msg.inReplyTo?.messageExternalId,
      references: msg.inReplyTo?.references,
    });
    const res = await gmailFetch(ctx, "/messages/send", { method: "POST", body: JSON.stringify({ raw: encodeBase64Url(raw), threadId: msg.externalConversationId }) }, "messages.send");
    const sent = await res.json();
    return { externalMessageId: sent.id, externalConversationId: sent.threadId, sentAt: new Date().toISOString() };
  },

  async markRead(ctx, threadId) {
    await gmailFetch(ctx, `/threads/${threadId}/modify`, { method: "POST", body: JSON.stringify({ removeLabelIds: ["UNREAD"] }) }, "threads.modify");
  },

  async archive(ctx, threadId, archived) {
    await gmailFetch(ctx, `/threads/${threadId}/modify`, { method: "POST", body: JSON.stringify(archived ? { removeLabelIds: ["INBOX"] } : { addLabelIds: ["INBOX"] }) }, "threads.modify");
  },
};
