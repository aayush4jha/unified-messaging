import { createHmac, timingSafeEqual } from "node:crypto";
import {
  AuthError,
  ConnectorError,
  RateLimitError,
  providerFetch,
  type ConnectedIdentity,
  type Connector,
  type ConnectorContext,
  type NormalizedConversation,
  type NormalizedMessage,
} from "./types";

/**
 * Slack connector (Web API + OAuth v2 with a *user* token, so replies are sent as you).
 *
 * Note: Slack throttles conversations.history to 1 req/min (15 messages) for
 * commercially distributed apps not approved for the Slack Marketplace.
 * Internal apps (self-hosted Orbit registered in your own workspace) are exempt.
 * The connector honors Retry-After and backfills newest-first.
 */

export const SLACK_USER_SCOPES = [
  "channels:history",
  "groups:history",
  "im:history",
  "mpim:history",
  "channels:read",
  "groups:read",
  "im:read",
  "mpim:read",
  "users:read",
  "chat:write",
  "files:read",
  "files:write",
  "channels:write",
  "groups:write",
  "im:write",
  "mpim:write",
];

const API = "https://slack.com/api";

/* ------------------------------------------------------------------ pure helpers (unit-tested) */

/** Verifies an Events API request (v0 signing secret scheme, 5-minute replay window). */
export function verifySlackSignature(opts: { signingSecret: string; timestamp: string | null; signature: string | null; rawBody: string; now?: number }): boolean {
  if (!opts.timestamp || !opts.signature) return false;
  const ts = Number(opts.timestamp);
  if (!Number.isFinite(ts) || Math.abs((opts.now ?? Date.now()) / 1000 - ts) > 300) return false;
  const expected = `v0=${createHmac("sha256", opts.signingSecret).update(`v0:${opts.timestamp}:${opts.rawBody}`).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(opts.signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Slack mrkdwn → readable plain text, resolving <@U123> mentions with a lookup. */
export function slackToText(text: string, names: Record<string, string>): string {
  return text
    .replace(/<@([A-Z0-9]+)(\|[^>]+)?>/g, (_, id) => `@${names[id] ?? id}`)
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2 ($1)")
    .replace(/<(https?:[^>]+)>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function slackTsToIso(ts: string): string {
  return new Date(Math.round(Number(ts) * 1000)).toISOString();
}

/* ------------------------------------------------------------------ API */

async function slackCall<T = Record<string, unknown>>(token: string, method: string, params: Record<string, unknown> = {}, post = false): Promise<T> {
  const defined = Object.entries(params).filter(([, v]) => v !== undefined);
  // JSON bodies keep value types (e.g. `files` arrays); query strings are stringified.
  const res = post
    ? await providerFetch(`${API}/${method}`, { label: `slack ${method}`, method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(Object.fromEntries(defined)) })
    : await providerFetch(`${API}/${method}?${new URLSearchParams(defined.map(([k, v]) => [k, String(v)]))}`, { label: `slack ${method}`, headers: { authorization: `Bearer ${token}` } });
  const data = (await res.json()) as { ok: boolean; error?: string } & T;
  if (!data.ok) {
    if (["invalid_auth", "token_revoked", "account_inactive", "not_authed", "token_expired"].includes(data.error ?? "")) throw new AuthError(`Slack: ${data.error}`);
    if (data.error === "ratelimited") throw new RateLimitError(Number(res.headers.get("retry-after")) || 60);
    throw new ConnectorError(`Slack ${method}: ${data.error}`, false);
  }
  return data;
}

interface SlackMessage {
  ts: string;
  user?: string;
  bot_id?: string;
  text?: string;
  subtype?: string;
  thread_ts?: string;
  reply_count?: number;
  reactions?: { name: string; count: number; users: string[] }[];
  files?: { id: string; name: string; mimetype: string; size: number }[];
}

const nameCache = new Map<string, string>();
async function userName(token: string, id: string): Promise<string> {
  if (nameCache.has(id)) return nameCache.get(id)!;
  try {
    const r = await slackCall<{ user: { real_name?: string; profile?: { display_name?: string; real_name?: string } } }>(token, "users.info", { user: id });
    const n = r.user.profile?.real_name || r.user.real_name || r.user.profile?.display_name || id;
    nameCache.set(id, n);
    return n;
  } catch {
    return id;
  }
}

function selfId(ctx: ConnectorContext) {
  return ctx.tokens.extra?.userId ?? "";
}

async function normalize(ctx: ConnectorContext, m: SlackMessage): Promise<NormalizedMessage> {
  const ids = new Set([m.user, ...[...(m.text ?? "").matchAll(/<@([A-Z0-9]+)/g)].map((x) => x[1])].filter(Boolean) as string[]);
  const names: Record<string, string> = {};
  for (const id of ids) names[id] = await userName(ctx.tokens.accessToken, id);
  const mine = m.user === selfId(ctx);
  return {
    externalId: m.ts,
    authorExternalId: mine ? "me" : (m.user ?? m.bot_id ?? "unknown"),
    authorName: mine ? undefined : m.user ? names[m.user] : "Bot",
    sentAt: slackTsToIso(m.ts),
    body: slackToText(m.text ?? "", names),
    attachments: (m.files ?? []).map((f) => ({ externalId: f.id, name: f.name, mimeType: f.mimetype, size: f.size })),
    threadExternalId: m.thread_ts,
    metadata: { replyCount: m.reply_count, reactions: m.reactions?.map((r) => ({ emoji: r.name, count: r.count, mine: r.users.includes(selfId(ctx)) })) },
  };
}

export const SlackConnector: Connector = {
  platform: "slack",
  isConfigured: () => !!(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET),

  getAuthorizationUrl(state, redirectUri) {
    const p = new URLSearchParams({ client_id: process.env.SLACK_CLIENT_ID!, user_scope: SLACK_USER_SCOPES.join(","), redirect_uri: redirectUri, state });
    return `https://slack.com/oauth/v2/authorize?${p}`;
  },

  async exchangeCode(code, redirectUri): Promise<ConnectedIdentity> {
    const res = await providerFetch(`${API}/oauth.v2.access`, {
      label: "slack oauth",
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: process.env.SLACK_CLIENT_ID!, client_secret: process.env.SLACK_CLIENT_SECRET!, code, redirect_uri: redirectUri }),
    });
    const d = await res.json();
    if (!d.ok || !d.authed_user?.access_token) throw new ConnectorError(`Slack sign-in failed: ${d.error ?? "no user token"}`, false);
    const token = d.authed_user.access_token as string;
    const who = await slackCall<{ url: string; team: string; user_id: string; team_id: string }>(token, "auth.test");
    return {
      externalAccountId: `${who.team_id}:${who.user_id}`,
      handle: new URL(who.url).host,
      label: who.team,
      scopes: String(d.authed_user.scope ?? "").split(","),
      tokens: { accessToken: token, extra: { userId: who.user_id, teamId: who.team_id } },
    };
  },

  async revoke(tokens) {
    await slackCall(tokens.accessToken, "auth.revoke").catch(() => undefined);
  },

  async listConversations(ctx, cursor) {
    const token = ctx.tokens.accessToken;
    const r = await slackCall<{ channels: { id: string; name?: string; is_im?: boolean; is_mpim?: boolean; user?: string; is_private?: boolean; updated?: number }[]; response_metadata?: { next_cursor?: string } }>(
      token,
      "users.conversations",
      { types: "public_channel,private_channel,mpim,im", exclude_archived: "true", limit: 100, cursor },
    );
    const items: NormalizedConversation[] = [];
    for (const ch of r.channels) {
      const kind = ch.is_im ? "dm" : ch.is_mpim ? "group" : "channel";
      const title = ch.is_im && ch.user ? await userName(token, ch.user) : (ch.name ?? ch.id);
      items.push({
        externalId: ch.id,
        kind,
        title,
        participants: ch.is_im && ch.user ? [{ externalId: ch.user, name: title }] : [],
        unreadCount: 0,
        lastMessageAt: ch.updated ? new Date(ch.updated).toISOString() : new Date(0).toISOString(),
        externalUrl: `https://app.slack.com/client/${ctx.tokens.extra?.teamId ?? ""}/${ch.id}`,
      });
    }
    return { items, nextCursor: r.response_metadata?.next_cursor || undefined };
  },

  async listMessages(ctx, channel, cursor) {
    // limit 15 matches the non-Marketplace cap; larger installs can raise it.
    const r = await slackCall<{ messages: SlackMessage[]; response_metadata?: { next_cursor?: string } }>(ctx.tokens.accessToken, "conversations.history", { channel, limit: Number(process.env.SLACK_HISTORY_LIMIT ?? 15), cursor });
    const items: NormalizedMessage[] = [];
    for (const m of r.messages.filter((x) => !x.subtype || x.subtype === "thread_broadcast" || x.subtype === "file_share")) items.push(await normalize(ctx, m));
    return { items: items.sort((a, b) => a.sentAt.localeCompare(b.sentAt)), nextCursor: r.response_metadata?.next_cursor || undefined };
  },

  async send(ctx, msg) {
    if (!msg.externalConversationId) throw new ConnectorError("Choose a Slack channel or person to message.", false);
    if (msg.attachments?.length) {
      // files.upload v2: reserve an upload URL per file, upload bytes, then share them with the message text.
      const ids: { id: string; title: string }[] = [];
      for (const f of msg.attachments) {
        const slot = await slackCall<{ upload_url: string; file_id: string }>(ctx.tokens.accessToken, "files.getUploadURLExternal", { filename: f.name, length: f.data.length });
        const up = await providerFetch(slot.upload_url, { label: "slack upload", method: "POST", body: new Uint8Array(f.data) });
        if (!up.ok) throw new ConnectorError(`Slack upload failed (${up.status})`, true);
        ids.push({ id: slot.file_id, title: f.name });
      }
      const done = await slackCall<{ files: { id: string; shares?: Record<string, Record<string, { ts: string }[]>> }[] }>(
        ctx.tokens.accessToken,
        "files.completeUploadExternal",
        { files: ids, channel_id: msg.externalConversationId, initial_comment: msg.body, thread_ts: msg.inReplyTo?.messageExternalId },
        true,
      );
      const share = Object.values(done.files[0]?.shares ?? {}).flatMap((byChannel) => byChannel[msg.externalConversationId!] ?? [])[0];
      const ts = share?.ts ?? String(Date.now() / 1000);
      return { externalMessageId: ts, externalConversationId: msg.externalConversationId, sentAt: slackTsToIso(ts) };
    }
    const r = await slackCall<{ channel: string; ts: string }>(ctx.tokens.accessToken, "chat.postMessage", { channel: msg.externalConversationId, text: msg.body, thread_ts: msg.inReplyTo?.messageExternalId }, true);
    return { externalMessageId: r.ts, externalConversationId: r.channel, sentAt: slackTsToIso(r.ts) };
  },

  attachmentLimits: { perFile: 100 * 1024 * 1024, total: 200 * 1024 * 1024 },

  async downloadAttachment(ctx, _messageId, att) {
    if (!att.externalId) throw new ConnectorError("This file can't be downloaded.", false);
    const info = await slackCall<{ file: { url_private_download?: string; url_private?: string; name: string; mimetype: string } }>(ctx.tokens.accessToken, "files.info", { file: att.externalId });
    const url = info.file.url_private_download ?? info.file.url_private;
    if (!url) throw new ConnectorError("Slack didn't return a download link for this file.", false);
    const res = await providerFetch(url, { label: "slack file", headers: { authorization: `Bearer ${ctx.tokens.accessToken}` } });
    if (!res.ok) throw new ConnectorError(`Couldn't download file (${res.status})`, false);
    return { data: Buffer.from(await res.arrayBuffer()), mimeType: info.file.mimetype || att.mimeType, name: info.file.name || att.name };
  },

  async markRead(ctx, channel) {
    await slackCall(ctx.tokens.accessToken, "conversations.mark", { channel, ts: String(Date.now() / 1000) }, true);
  },
};

/** Opens (or reuses) a DM with a Slack user id, for composing to a person. */
export async function openSlackDM(token: string, userId: string): Promise<string> {
  const r = await slackCall<{ channel: { id: string } }>(token, "conversations.open", { users: userId }, true);
  return r.channel.id;
}

export { normalize as normalizeSlackMessage };
