import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Account, Conversation, Message, PlatformId } from "@/lib/types";
import { decryptJSON, encryptJSON } from "./crypto";
import { getConnector } from "./connectors";
import { normalizeTelegramUpdate, type TgUpdate } from "./connectors/telegram";
import { AuthError, ConnectorError, RateLimitError, type ConnectorContext, type NormalizedConversation, type NormalizedMessage, type OutboundFile, type TokenSet } from "./connectors/types";
import { identityFor } from "./identity";
import { getServiceClient } from "./supabase";

/* ------------------------------------------------------------------ rows */

export interface AccountRow {
  id: string;
  user_id: string;
  platform_id: PlatformId;
  external_account_id: string;
  label: string;
  handle: string;
  status: Account["status"];
  status_message: string | null;
  encrypted_tokens: string;
  scopes: string[];
  is_default_sender: boolean;
  ai_enabled: boolean;
  notifications_enabled: boolean;
  capability_overrides: Record<string, boolean>;
  sync_cursor: Record<string, unknown>;
  webhook_secret: string | null;
  last_synced_at: string | null;
}

export async function loadAccount(db: SupabaseClient, userId: string, accountId: string): Promise<AccountRow | null> {
  const { data } = await db.from("connected_accounts").select("*").eq("id", accountId).eq("user_id", userId).maybeSingle();
  return (data as AccountRow) ?? null;
}

export function contextFor(db: SupabaseClient, row: AccountRow): ConnectorContext {
  return {
    tokens: decryptJSON<TokenSet>(row.encrypted_tokens),
    accountHandle: row.handle,
    async saveTokens(tokens) {
      await db.from("connected_accounts").update({ encrypted_tokens: encryptJSON(tokens) }).eq("id", row.id).eq("user_id", row.user_id);
    },
  };
}

async function audit(db: SupabaseClient, userId: string, action: string, target?: string, metadata: Record<string, unknown> = {}) {
  await db.from("audit_logs").insert({ user_id: userId, action, target, metadata });
}

/* ------------------------------------------------------------------ connect / disconnect */

export async function saveConnectedAccount(userId: string, platform: PlatformId, identity: { externalAccountId: string; handle: string; label: string; tokens: TokenSet; scopes: string[] }, extra: Partial<AccountRow> = {}): Promise<string> {
  const db = getServiceClient();
  const existing = await db.from("connected_accounts").select("id,label").eq("user_id", userId).eq("platform_id", platform).eq("external_account_id", identity.externalAccountId).maybeSingle();
  const { count } = await db.from("connected_accounts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("platform_id", platform);
  const row = {
    user_id: userId,
    platform_id: platform,
    external_account_id: identity.externalAccountId,
    label: existing.data?.label ?? identity.label,
    handle: identity.handle,
    status: "connected",
    status_message: null,
    encrypted_tokens: encryptJSON(identity.tokens),
    scopes: identity.scopes,
    is_default_sender: !existing.data && (count ?? 0) === 0,
    ...extra,
  };
  const { data, error } = await db.from("connected_accounts").upsert(row, { onConflict: "user_id,platform_id,external_account_id" }).select("id").single();
  if (error) throw new Error(`Couldn't save account: ${error.message}`);
  await audit(db, userId, existing.data ? "account.reconnect" : "account.connect", data.id, { platform, handle: identity.handle });
  return data.id as string;
}

export async function disconnectAccount(userId: string, accountId: string): Promise<boolean> {
  const db = getServiceClient();
  const row = await loadAccount(db, userId, accountId);
  if (!row) return false;
  const connector = getConnector(row.platform_id);
  try {
    if (connector?.revoke) await connector.revoke(decryptJSON<TokenSet>(row.encrypted_tokens));
  } catch {
    // Revocation is best-effort; deleting our copy of the data is not.
  }
  await db.from("connected_accounts").delete().eq("id", accountId).eq("user_id", userId); // cascades to conversations, messages, notes…
  await audit(db, userId, "account.disconnect", accountId, { platform: row.platform_id, handle: row.handle, dataDeleted: true });
  return true;
}

/* ------------------------------------------------------------------ ingest */

export async function upsertConversation(db: SupabaseClient, row: AccountRow, nc: NormalizedConversation): Promise<string> {
  const meta = (nc.metadata ?? {}) as { archived?: boolean; starred?: boolean; important?: boolean };
  const { data, error } = await db
    .from("conversations")
    .upsert(
      {
        user_id: row.user_id,
        account_id: row.id,
        external_id: nc.externalId,
        kind: nc.kind,
        title: nc.title,
        last_message_at: nc.lastMessageAt,
        unread_count: nc.unreadCount,
        external_url: nc.externalUrl,
        ...(meta.archived !== undefined ? { archived: meta.archived } : {}),
        ...(meta.starred ? { starred: true } : {}),
        ...(meta.important ? { important: true } : {}),
        category: row.platform_id === "slack" ? "work" : "personal",
      },
      { onConflict: "account_id,external_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`conversation upsert: ${error.message}`);
  if (nc.participants.length) {
    const linked = await Promise.all(nc.participants.map(async (p) => ({ p, contactId: await resolveContact(db, row, p) })));
    await db.from("conversation_participants").upsert(
      linked.map(({ p, contactId }) => ({ conversation_id: data.id, user_id: row.user_id, external_id: p.externalId, name: p.name, handle: p.handle, contact_id: contactId })),
      { onConflict: "conversation_id,external_id" },
    );
    // 1:1 conversations take their contact from the single participant.
    if ((nc.kind === "dm" || nc.kind === "email") && linked.length === 1 && linked[0].contactId) {
      await db.from("conversations").update({ contact_id: linked[0].contactId }).eq("id", data.id).eq("user_id", row.user_id);
    }
  }
  return data.id as string;
}

/* ------------------------------------------------------------------ contact unification */

export async function resolveContact(db: SupabaseClient, row: AccountRow, p: { externalId: string; name: string; handle?: string }): Promise<string | null> {
  const id = identityFor(row.platform_id, row.external_account_id, p);
  if (!id) return null;
  let q = db.from("contact_identities").select("contact_id, contacts(merged_into)").eq("user_id", row.user_id).eq("kind", id.kind).eq("value", id.value);
  q = id.platform_id ? q.eq("platform_id", id.platform_id) : q.is("platform_id", null);
  const { data: found } = await q.maybeSingle();
  if (found) {
    const mergedInto = (found.contacts as unknown as { merged_into: string | null } | null)?.merged_into;
    return mergedInto ?? (found.contact_id as string);
  }
  const { data: contact, error } = await db
    .from("contacts")
    .insert({ user_id: row.user_id, name: p.name || id.value, avatar_hue: hueOf(p.name || id.value) })
    .select("id")
    .single();
  if (error || !contact) return null;
  const ins = await db.from("contact_identities").insert({ user_id: row.user_id, contact_id: contact.id, kind: id.kind, platform_id: id.platform_id, value: id.value, display: p.handle ?? (id.kind === "email" ? id.value : p.name), account_id: row.id });
  if (ins.error) {
    // Lost a race with a concurrent sync: use the identity that won and drop our empty contact.
    await db.from("contacts").delete().eq("id", contact.id).eq("user_id", row.user_id);
    let retry = db.from("contact_identities").select("contact_id").eq("user_id", row.user_id).eq("kind", id.kind).eq("value", id.value);
    retry = id.platform_id ? retry.eq("platform_id", id.platform_id) : retry.is("platform_id", null);
    return ((await retry.maybeSingle()).data?.contact_id as string) ?? null;
  }
  return contact.id as string;
}

function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export async function insertMessages(db: SupabaseClient, row: AccountRow, conversationId: string, messages: NormalizedMessage[]): Promise<number> {
  if (!messages.length) return 0;
  const { data, error } = await db
    .from("messages")
    .upsert(
      messages.map((m) => ({
        user_id: row.user_id,
        conversation_id: conversationId,
        external_id: m.externalId,
        author_external_id: m.authorExternalId,
        author_name: m.authorName,
        subject: m.subject,
        body: m.body,
        body_html: m.bodyHtml,
        to_addrs: m.to ?? [],
        cc_addrs: m.cc ?? [],
        status: m.authorExternalId === "me" ? "sent" : "delivered",
        sent_at: m.sentAt,
        thread_external_id: m.threadExternalId,
        metadata: { ...(m.metadata ?? {}), attachments: m.attachments },
      })),
      { onConflict: "conversation_id,external_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`message upsert: ${error.message}`);
  if (messages.some((m) => m.attachments.length)) await db.from("conversations").update({ has_attachments: true }).eq("id", conversationId).eq("user_id", row.user_id);
  return data?.length ?? 0;
}

/* ------------------------------------------------------------------ sync */

export interface SyncStats {
  conversations: number;
  messages: number;
  rateLimited?: boolean;
}

export async function syncAccount(userId: string, accountId: string, kind: "initial" | "incremental" = "incremental"): Promise<SyncStats> {
  const db = getServiceClient();
  const row = await loadAccount(db, userId, accountId);
  if (!row) throw new Error("Account not found");
  if (row.status === "paused") return { conversations: 0, messages: 0 };
  const connector = getConnector(row.platform_id);
  if (!connector) throw new Error(`No connector for ${row.platform_id}`);

  const { data: job } = await db.from("sync_jobs").insert({ user_id: userId, account_id: accountId, kind, status: "running", started_at: new Date().toISOString(), attempts: 1 }).select("id").single();
  await db.from("connected_accounts").update({ status: "syncing" }).eq("id", accountId).eq("user_id", userId);
  const stats: SyncStats = { conversations: 0, messages: 0 };
  const ctx = contextFor(db, row);

  try {
    if (row.platform_id === "telegram" && !process.env.ORBIT_PUBLIC_URL) {
      // No public URL → webhook can't reach us; poll getUpdates instead.
      const { telegramGetUpdates } = await import("./connectors/telegram");
      const offset = Number(row.sync_cursor.offset ?? 0) || undefined;
      const updates = await telegramGetUpdates(ctx.tokens.accessToken, offset);
      for (const u of updates) {
        const n = await ingestTelegramUpdate(db, row, u);
        stats.messages += n;
      }
      if (updates.length) await db.from("connected_accounts").update({ sync_cursor: { ...row.sync_cursor, offset: updates[updates.length - 1].update_id + 1 } }).eq("id", row.id);
    } else {
      const pages = kind === "initial" ? 2 : 1;
      let cursor: string | undefined;
      for (let p = 0; p < pages; p++) {
        const page = await connector.listConversations(ctx, cursor);
        for (const nc of page.items) {
          const convId = await upsertConversation(db, row, nc);
          stats.conversations++;
          const msgs = nc.messages ?? (await connector.listMessages(ctx, nc.externalId)).items;
          stats.messages += await insertMessages(db, row, convId, msgs);
        }
        cursor = page.nextCursor;
        if (!cursor) break;
      }
    }
    await db.from("connected_accounts").update({ status: "connected", status_message: null, last_synced_at: new Date().toISOString() }).eq("id", accountId).eq("user_id", userId);
    await db.from("sync_jobs").update({ status: "succeeded", finished_at: new Date().toISOString(), stats }).eq("id", job?.id);
    return stats;
  } catch (e) {
    const err = e as Error;
    if (e instanceof AuthError) {
      await db.from("connected_accounts").update({ status: "needs_reauth", status_message: err.message }).eq("id", accountId).eq("user_id", userId);
      await db.from("notifications").insert({ user_id: userId, kind: "system", title: `${row.label} needs to reconnect`, body: err.message, account_id: accountId });
      await db.from("sync_jobs").update({ status: "failed", finished_at: new Date().toISOString(), error: err.message }).eq("id", job?.id);
    } else if (e instanceof RateLimitError || (e instanceof ConnectorError && e.retryable)) {
      const retryAfter = e instanceof RateLimitError ? e.retryAfter : 60;
      await db.from("connected_accounts").update({ status: "connected", status_message: `Sync paused by provider rate limit; resuming in ~${Math.ceil(retryAfter / 60)} min.` }).eq("id", accountId);
      await db.from("sync_jobs").update({ status: "retrying", error: err.message, next_run_at: new Date(Date.now() + retryAfter * 1000).toISOString(), stats }).eq("id", job?.id);
      stats.rateLimited = true;
      return stats;
    } else {
      await db.from("connected_accounts").update({ status: "error", status_message: err.message.slice(0, 300) }).eq("id", accountId).eq("user_id", userId);
      await db.from("sync_jobs").update({ status: "failed", finished_at: new Date().toISOString(), error: err.message }).eq("id", job?.id);
    }
    throw e;
  }
}

export async function ingestTelegramUpdate(db: SupabaseClient, row: AccountRow, update: TgUpdate): Promise<number> {
  const botId = Number(row.external_account_id);
  const n = normalizeTelegramUpdate(update, botId);
  if (!n) return 0;
  const convId = await upsertConversation(db, row, { ...n.conversation, unreadCount: 0 });
  const inserted = await insertMessages(db, row, convId, [n.message]);
  if (inserted && n.message.authorExternalId !== "me") {
    await db.rpc("increment_unread", { conv_id: convId });
    if (row.notifications_enabled) await db.from("notifications").insert({ user_id: row.user_id, kind: "message", title: n.message.authorName ?? n.conversation.title, body: n.message.body.slice(0, 200), conversation_id: convId, account_id: row.id });
  }
  return inserted;
}

/* ------------------------------------------------------------------ send (idempotent) */

export interface SendInput {
  clientId: string;
  attachments?: OutboundFile[];
  accountId: string;
  conversationId?: string;
  to: string[];
  cc?: string[];
  subject?: string;
  body: string;
}

export async function sendMessage(userId: string, input: SendInput): Promise<{ message: Message; conversationId: string }> {
  const db = getServiceClient();

  // Idempotency: a retry with the same clientId returns the original result.
  const prior = await db.from("messages").select("*").eq("user_id", userId).eq("client_id", input.clientId).maybeSingle();
  if (prior.data && prior.data.status === "sent") return { message: rowToMessage(prior.data), conversationId: prior.data.conversation_id };
  if (prior.data && prior.data.status === "pending" && Date.now() - new Date(prior.data.created_at).getTime() < 60_000) {
    throw new ConnectorError("This message is already being sent.", false);
  }

  const row = await loadAccount(db, userId, input.accountId);
  if (!row) throw new ConnectorError("Account not found.", false);
  if (row.status === "needs_reauth") throw new AuthError(`${row.label} needs to reconnect before it can send.`);
  const connector = getConnector(row.platform_id);
  if (!connector) throw new ConnectorError("Sending isn't supported for this platform.", false);
  const files = input.attachments ?? [];
  if (files.length) {
    const limits = connector.attachmentLimits;
    if (!limits) throw new ConnectorError("This account can't send attachments.", false);
    const total = files.reduce((n, f) => n + f.data.length, 0);
    const big = files.find((f) => f.data.length > limits.perFile);
    if (big) throw new ConnectorError(`${big.name} is larger than ${Math.round(limits.perFile / 1024 / 1024)} MB, the limit for this account.`, false);
    if (total > limits.total) throw new ConnectorError(`Attachments total more than ${Math.round(limits.total / 1024 / 1024)} MB, the limit for this account.`, false);
  }
  const attachmentMeta = files.map((f) => ({ name: f.name, mimeType: f.mimeType, size: f.data.length }));

  let conv: { id: string; external_id: string } | null = null;
  let replyTo: { messageExternalId: string; references?: string } | undefined;
  if (input.conversationId) {
    const { data } = await db.from("conversations").select("id, external_id").eq("id", input.conversationId).eq("user_id", userId).single();
    conv = data;
    if ((row.platform_id === "gmail" || row.platform_id === "outlook") && conv) {
      const { data: last } = await db.from("messages").select("external_id, metadata").eq("conversation_id", conv.id).not("external_id", "is", null).order("sent_at", { ascending: false }).limit(1).maybeSingle();
      const meta = (last?.metadata ?? {}) as { messageIdHeader?: string; references?: string };
      // Gmail threads replies by RFC Message-ID headers; Graph replies to a message id (createReply).
      if (row.platform_id === "gmail" && meta.messageIdHeader) replyTo = { messageExternalId: meta.messageIdHeader, references: meta.references };
      if (row.platform_id === "outlook" && last?.external_id) replyTo = { messageExternalId: last.external_id as string };
    }
  }

  // Record the pending message first (unique client_id prevents duplicates).
  const pendingRow = {
    user_id: userId,
    conversation_id: conv?.id,
    client_id: input.clientId,
    author_external_id: "me",
    subject: input.subject,
    body: input.body,
    to_addrs: input.to,
    cc_addrs: input.cc ?? [],
    status: "pending",
    sent_at: new Date().toISOString(),
    metadata: { attachments: attachmentMeta },
  };
  let pendingId = prior.data?.id as string | undefined;
  if (conv && !pendingId) {
    const ins = await db.from("messages").insert(pendingRow).select("id").single();
    if (ins.error) throw new ConnectorError("This message is already being sent.", false);
    pendingId = ins.data.id;
  }

  try {
    const ctx = contextFor(db, row);
    const result = await connector.send(ctx, { clientId: input.clientId, externalConversationId: conv?.external_id, to: input.to, cc: input.cc, subject: input.subject, body: input.body, inReplyTo: replyTo, attachments: files });

    if (!conv) {
      // New conversation started by compose: create it now that the provider confirmed.
      const convId = await upsertConversation(db, row, {
        externalId: result.externalConversationId,
        kind: row.platform_id === "gmail" || row.platform_id === "outlook" ? "email" : "dm",
        title: input.subject || input.to.join(", "),
        participants: input.to.map((t) => ({ externalId: t, name: t, handle: t })),
        unreadCount: 0,
        lastMessageAt: result.sentAt,
      });
      conv = { id: convId, external_id: result.externalConversationId };
      const ins = await db.from("messages").insert({ ...pendingRow, conversation_id: convId, external_id: result.externalMessageId, status: "sent", sent_at: result.sentAt }).select("*").single();
      return { message: rowToMessage(ins.data), conversationId: convId };
    }
    const upd = await db.from("messages").update({ external_id: result.externalMessageId, status: "sent", sent_at: result.sentAt, error: null }).eq("id", pendingId!).select("*").single();
    return { message: rowToMessage(upd.data), conversationId: conv.id };
  } catch (e) {
    if (pendingId) await db.from("messages").update({ status: "failed", error: (e as Error).message.slice(0, 300) }).eq("id", pendingId);
    if (e instanceof AuthError) await db.from("connected_accounts").update({ status: "needs_reauth", status_message: e.message }).eq("id", row.id);
    throw e;
  }
}

/* ------------------------------------------------------------------ mappers (DB → client types) */

export function rowToMessage(r: Record<string, unknown>): Message {
  const meta = (r.metadata ?? {}) as { attachments?: { externalId?: string; name: string; mimeType: string; size: number }[]; replyCount?: number; reactions?: Message["reactions"] };
  return {
    id: r.id as string,
    conversationId: r.conversation_id as string,
    authorId: (r.author_external_id as string) ?? "unknown",
    body: (r.body as string) ?? "",
    sentAt: r.sent_at as string,
    status: r.status as Message["status"],
    attachments: (meta.attachments ?? []).map((a, i) => ({
      id: a.externalId ?? `${r.id}_${i}`,
      name: a.name,
      mimeType: a.mimeType,
      size: a.size,
      // Received files stream through Orbit's authenticated proxy; sent files live in the provider's Sent folder.
      url: r.author_external_id !== "me" && a.externalId ? `/api/attachments/${r.id}/${i}` : undefined,
    })),
    subject: (r.subject as string) ?? undefined,
    to: (r.to_addrs as string[]) ?? [],
    cc: (r.cc_addrs as string[]) ?? [],
    threadReplyCount: meta.replyCount,
    reactions: meta.reactions,
    clientId: (r.client_id as string) ?? undefined,
    error: (r.error as string) ?? undefined,
    isDemo: false,
  };
}

export function rowToAccount(r: Record<string, unknown>): Account {
  return {
    id: r.id as string,
    platform: r.platform_id as PlatformId,
    label: r.label as string,
    handle: r.handle as string,
    status: r.status as Account["status"],
    statusMessage: (r.status_message as string) ?? undefined,
    lastSyncedAt: (r.last_synced_at as string) ?? undefined,
    isDefaultSender: r.is_default_sender as boolean,
    aiEnabled: r.ai_enabled as boolean,
    notificationsEnabled: r.notifications_enabled as boolean,
    capabilityOverrides: (r.capability_overrides as Record<string, boolean>) ?? {},
    isDemo: false,
  };
}

export function rowToConversation(r: Record<string, unknown>, platform: PlatformId, participants: { external_id: string; name: string; handle: string | null; contact_id: string | null }[]): Conversation {
  return {
    id: r.id as string,
    accountId: r.account_id as string,
    platform,
    kind: r.kind as Conversation["kind"],
    title: r.title as string,
    participants: participants.map((p) => ({ id: p.external_id, name: p.name, handle: p.handle ?? undefined, contactId: p.contact_id ?? undefined })),
    contactId: (r.contact_id as string) ?? undefined,
    lastMessageAt: r.last_message_at as string,
    preview: (r.preview as string) ?? "",
    lastAuthorId: (r.last_author as string) ?? "",
    unreadCount: (r.unread_count as number) ?? 0,
    starred: !!r.starred,
    pinned: !!r.pinned,
    archived: !!r.archived,
    snoozedUntil: (r.snoozed_until as string) ?? undefined,
    important: !!r.important,
    priority: "normal",
    priorityReasons: [],
    category: (r.category as Conversation["category"]) ?? "personal",
    labels: [],
    hasAttachments: !!r.has_attachments,
    muted: !!r.muted,
    messageCount: (r.message_count as number) ?? 0,
    isDemo: false,
    externalUrl: (r.external_url as string) ?? undefined,
  };
}
