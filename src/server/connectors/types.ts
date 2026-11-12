import type { ConversationKind, PlatformId } from "@/lib/types";

/**
 * The contract every provider connector implements. Operations a provider
 * doesn't support are simply absent; the platform registry
 * (src/lib/platforms.ts) declares the matching capabilities for the UI.
 */

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms
  scope?: string;
  /** Provider-specific extras (e.g. Slack team id, Telegram bot id). */
  extra?: Record<string, string>;
}

export interface ConnectedIdentity {
  externalAccountId: string;
  handle: string;
  label: string;
  tokens: TokenSet;
  scopes: string[];
}

export interface ConnectorContext {
  tokens: TokenSet;
  /** Persist refreshed tokens. */
  saveTokens(tokens: TokenSet): Promise<void>;
  accountHandle: string;
}

export interface NormalizedParticipant {
  externalId: string;
  name: string;
  handle?: string;
}

export interface NormalizedAttachment {
  externalId?: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface NormalizedMessage {
  externalId: string;
  authorExternalId: string; // "me" for the account owner
  authorName?: string;
  sentAt: string;
  subject?: string;
  body: string;
  bodyHtml?: string;
  to?: string[];
  cc?: string[];
  attachments: NormalizedAttachment[];
  threadExternalId?: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedConversation {
  externalId: string;
  kind: ConversationKind;
  title: string;
  participants: NormalizedParticipant[];
  unreadCount: number;
  lastMessageAt: string;
  externalUrl?: string;
  /** Included when cheap to fetch alongside the conversation (e.g. Gmail thread). */
  messages?: NormalizedMessage[];
  metadata?: Record<string, unknown>;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

export interface OutboundFile {
  name: string;
  mimeType: string;
  data: Buffer;
}

export interface DownloadedFile {
  data: Buffer;
  mimeType: string;
  name: string;
}

export interface OutboundMessage {
  clientId: string;
  attachments?: OutboundFile[];
  externalConversationId?: string;
  to: string[];
  cc?: string[];
  subject?: string;
  body: string;
  inReplyTo?: { messageExternalId: string; references?: string };
}

export interface SendResult {
  externalMessageId: string;
  externalConversationId: string;
  sentAt: string;
}

export interface Connector {
  platform: PlatformId;
  isConfigured(): boolean;
  getAuthorizationUrl?(state: string, redirectUri: string): string;
  exchangeCode?(code: string, redirectUri: string): Promise<ConnectedIdentity>;
  refresh?(tokens: TokenSet): Promise<TokenSet>;
  revoke?(tokens: TokenSet): Promise<void>;
  listConversations(ctx: ConnectorContext, cursor?: string): Promise<Page<NormalizedConversation>>;
  listMessages(ctx: ConnectorContext, externalConversationId: string, cursor?: string): Promise<Page<NormalizedMessage>>;
  send(ctx: ConnectorContext, msg: OutboundMessage): Promise<SendResult>;
  markRead?(ctx: ConnectorContext, externalConversationId: string): Promise<void>;
  /** Fetches a received attachment from the provider (Orbit doesn't store file bytes). */
  downloadAttachment?(ctx: ConnectorContext, messageExternalId: string, attachment: NormalizedAttachment): Promise<DownloadedFile>;
  /** Per-file and total limits for outbound attachments (bytes). */
  attachmentLimits?: { perFile: number; total: number };
  archive?(ctx: ConnectorContext, externalConversationId: string, archived: boolean): Promise<void>;
}

/* ------------------------------------------------------------------ typed errors */

export class ConnectorError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}
/** Credentials revoked/expired: account moves to needs_reauth. */
export class AuthError extends ConnectorError {
  constructor(message = "The provider rejected Orbit's access. Reconnect the account.") {
    super(message, false);
  }
}
/** Provider rate limit: retry after `retryAfter` seconds. */
export class RateLimitError extends ConnectorError {
  constructor(
    public readonly retryAfter: number,
    message = "The provider is rate limiting requests.",
  ) {
    super(message, true);
  }
}
export class TransientError extends ConnectorError {
  constructor(message = "Temporary provider error.") {
    super(message, true);
  }
}

/** Shared HTTP helper that maps provider status codes onto typed errors. */
export async function providerFetch(url: string, init: RequestInit & { label: string }): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(20_000) });
  } catch (e) {
    throw new TransientError(`${init.label}: network error (${e instanceof Error ? e.message : "unknown"})`);
  }
  if (res.status === 401) throw new AuthError();
  if (res.status === 429) throw new RateLimitError(Number(res.headers.get("retry-after")) || 30);
  if (res.status >= 500) throw new TransientError(`${init.label}: provider error ${res.status}`);
  return res;
}
