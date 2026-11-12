import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import MailComposer from "nodemailer/lib/mail-composer";
import nodemailer from "nodemailer";
import { stripQuotedReply } from "./gmail";
import { AuthError, ConnectorError, TransientError, type Connector, type ConnectorContext, type NormalizedConversation, type NormalizedMessage } from "./types";

/**
 * Generic IMAP/SMTP connector (iCloud, Fastmail, Yahoo, Zoho, AOL, self-hosted…).
 *
 * Credentials are a provider *app-specific password*, encrypted at rest with
 * the other tokens. Orbit never asks for an account's main password; Gmail
 * and Outlook use their OAuth connectors instead. Hosts are user-supplied,
 * so every connection is checked against private/internal addresses (SSRF
 * protection) and TLS is required.
 */

export interface ImapConfig {
  email: string;
  username: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

export const IMAP_PRESETS: Record<string, Omit<ImapConfig, "email" | "username">> = {
  icloud: { imapHost: "imap.mail.me.com", imapPort: 993, smtpHost: "smtp.mail.me.com", smtpPort: 587 },
  fastmail: { imapHost: "imap.fastmail.com", imapPort: 993, smtpHost: "smtp.fastmail.com", smtpPort: 465 },
  yahoo: { imapHost: "imap.mail.yahoo.com", imapPort: 993, smtpHost: "smtp.mail.yahoo.com", smtpPort: 465 },
  zoho: { imapHost: "imap.zoho.com", imapPort: 993, smtpHost: "smtp.zoho.com", smtpPort: 465 },
  aol: { imapHost: "imap.aol.com", imapPort: 993, smtpHost: "smtp.aol.com", smtpPort: 465 },
};

/* ------------------------------------------------------------------ SSRF protection (pure, unit-tested) */

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("ff");
}

export async function assertPublicHost(host: string): Promise<void> {
  if (!/^[a-z0-9.-]+$/i.test(host) || host.length > 253) throw new ConnectorError("Enter a valid mail server hostname.", false);
  if (/(^|\.)(localhost|local|internal)$/i.test(host)) throw new ConnectorError("Mail server must be a public host.", false);
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new ConnectorError(`Couldn't resolve ${host}.`, false);
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new ConnectorError("Mail server must be a public host.", false);
}

export function validatePorts(cfg: Pick<ImapConfig, "imapPort" | "smtpPort">): void {
  if (cfg.imapPort !== 993) throw new ConnectorError("IMAP must use TLS on port 993.", false);
  if (cfg.smtpPort !== 465 && cfg.smtpPort !== 587) throw new ConnectorError("SMTP must use port 465 (TLS) or 587 (STARTTLS).", false);
}

/* ------------------------------------------------------------------ threading + parsing (pure, unit-tested) */

const cleanId = (id?: string) => id?.trim().replace(/^<|>$/g, "").toLowerCase();

/** Conversation key: the thread's root Message-ID (first References entry, else In-Reply-To, else own id). */
export function threadRoot(m: { messageId?: string; inReplyTo?: string; references?: string | string[] }): string | undefined {
  const refs = Array.isArray(m.references) ? m.references : (m.references ?? "").split(/\s+/).filter(Boolean);
  return cleanId(refs[0]) ?? cleanId(m.inReplyTo) ?? cleanId(m.messageId);
}

const addresses = (a?: AddressObject | AddressObject[]) => (Array.isArray(a) ? a : a ? [a] : []).flatMap((x) => x.value).map((v) => ({ name: v.name || v.address || "", email: (v.address ?? "").toLowerCase() }));

export function normalizeParsedMail(mail: Pick<ParsedMail, "messageId" | "inReplyTo" | "references" | "from" | "to" | "cc" | "subject" | "date" | "text" | "attachments">, owner: string, folder: string, uid: number, seen: boolean): NormalizedMessage & { root: string; seen: boolean } {
  const from = addresses(mail.from)[0] ?? { name: "Unknown", email: "" };
  const mine = from.email === owner.toLowerCase() || /sent/i.test(folder);
  const id = cleanId(mail.messageId) ?? `${folder}:${uid}`;
  return {
    externalId: id,
    authorExternalId: mine ? "me" : from.email || "unknown",
    authorName: mine ? undefined : from.name,
    sentAt: (mail.date ?? new Date(0)).toISOString(),
    subject: mail.subject,
    body: stripQuotedReply(mail.text ?? "").trim(),
    to: addresses(mail.to as AddressObject | AddressObject[] | undefined).map((a) => a.email),
    cc: addresses(mail.cc as AddressObject | AddressObject[] | undefined).map((a) => a.email),
    attachments: (mail.attachments ?? []).filter((a) => a.contentDisposition !== "inline").map((a, i) => ({ externalId: `${folder}|${uid}|${i}`, name: a.filename ?? `attachment-${i + 1}`, mimeType: a.contentType, size: a.size })),
    metadata: { messageIdHeader: mail.messageId, references: Array.isArray(mail.references) ? mail.references.join(" ") : mail.references, folder, uid },
    root: threadRoot({ messageId: mail.messageId, inReplyTo: mail.inReplyTo, references: mail.references }) ?? id,
    seen,
  };
}

function stripThreadFields(m: ReturnType<typeof normalizeParsedMail>): NormalizedMessage {
  const out: Partial<ReturnType<typeof normalizeParsedMail>> = { ...m };
  delete out.root;
  delete out.seen;
  return out as NormalizedMessage;
}

export function groupImapThreads(messages: ReturnType<typeof normalizeParsedMail>[], owner: string, inboxFolder: string): NormalizedConversation[] {
  const byRoot = new Map<string, ReturnType<typeof normalizeParsedMail>[]>();
  // Deduplicate messages present in two folders (e.g. INBOX + Sent copies) by Message-ID.
  const unique = new Map(messages.map((m) => [m.externalId, m]));
  for (const m of unique.values()) byRoot.set(m.root, [...(byRoot.get(m.root) ?? []), m]);
  return [...byRoot.entries()]
    .map(([root, ms]) => {
      const sorted = [...ms].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
      const people = new Map<string, { externalId: string; name: string; handle: string }>();
      for (const m of sorted) {
        if (m.authorExternalId !== "me" && m.authorExternalId !== "unknown") people.set(m.authorExternalId, { externalId: m.authorExternalId, name: m.authorName ?? m.authorExternalId, handle: m.authorExternalId });
        for (const e of [...(m.to ?? []), ...(m.cc ?? [])]) if (e && e !== owner.toLowerCase() && !people.has(e)) people.set(e, { externalId: e, name: e, handle: e });
      }
      const subject = sorted.find((m) => m.subject)?.subject ?? "(no subject)";
      return {
        externalId: root,
        kind: "email" as const,
        title: subject.replace(/^(re|fwd?|aw):\s*/i, ""),
        participants: [...people.values()],
        unreadCount: sorted.filter((m) => !m.seen && m.authorExternalId !== "me").length,
        lastMessageAt: sorted[sorted.length - 1].sentAt,
        messages: sorted.map(stripThreadFields),
        metadata: { archived: !sorted.some((m) => (m.metadata as { folder?: string }).folder === inboxFolder) },
      };
    })
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

/* ------------------------------------------------------------------ IMAP/SMTP I/O */

function cfgOf(ctx: ConnectorContext): ImapConfig {
  const e = ctx.tokens.extra ?? {};
  return { email: e.email ?? ctx.accountHandle, username: e.username ?? ctx.accountHandle, imapHost: e.imapHost, imapPort: Number(e.imapPort), smtpHost: e.smtpHost, smtpPort: Number(e.smtpPort) };
}

async function withImap<T>(cfg: ImapConfig, password: string, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  await assertPublicHost(cfg.imapHost);
  const client = new ImapFlow({ host: cfg.imapHost, port: cfg.imapPort, secure: true, auth: { user: cfg.username, pass: password }, logger: false, socketTimeout: 30_000, emitLogs: false });
  try {
    await client.connect();
  } catch (e) {
    const msg = (e as { authenticationFailed?: boolean; responseText?: string }).authenticationFailed ? "The mail server rejected the app password." : `Couldn't connect to ${cfg.imapHost}.`;
    throw (e as { authenticationFailed?: boolean }).authenticationFailed ? new AuthError(msg) : new TransientError(msg);
  }
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function specialFolder(c: ImapFlow, use: "\\Sent" | "\\Archive"): Promise<string | undefined> {
  const list = await c.list();
  return list.find((f) => f.specialUse === use)?.path ?? list.find((f) => new RegExp(use === "\\Sent" ? "^(sent|sent items|sent mail)$" : "^archive$", "i").test(f.name))?.path;
}

async function recentFromFolder(c: ImapFlow, folder: string, owner: string, limit: number) {
  const out: ReturnType<typeof normalizeParsedMail>[] = [];
  const lock = await c.getMailboxLock(folder);
  try {
    const box = c.mailbox;
    const exists = box && typeof box === "object" ? box.exists : 0;
    if (!exists) return out;
    const start = Math.max(1, exists - limit + 1);
    for await (const m of c.fetch(`${start}:*`, { uid: true, flags: true, source: { maxLength: 2 * 1024 * 1024 } })) {
      if (!m.source) continue;
      const parsed = await simpleParser(m.source);
      out.push(normalizeParsedMail(parsed, owner, folder, m.uid, m.flags?.has("\\Seen") ?? false));
    }
  } finally {
    lock.release();
  }
  return out;
}

async function threadUids(c: ImapFlow, root: string): Promise<number[]> {
  const a = (await c.search({ header: { "message-id": `<${root}>` } }, { uid: true })) || [];
  const b = (await c.search({ header: { references: root } }, { uid: true })) || [];
  return Array.from(new Set([...a, ...b]));
}

/** Validates credentials against both servers before an account is saved. */
export async function verifyImapAccount(cfg: ImapConfig, password: string): Promise<void> {
  validatePorts(cfg);
  await assertPublicHost(cfg.imapHost);
  await assertPublicHost(cfg.smtpHost);
  await withImap(cfg, password, async () => undefined);
  const smtp = nodemailer.createTransport({ host: cfg.smtpHost, port: cfg.smtpPort, secure: cfg.smtpPort === 465, requireTLS: true, auth: { user: cfg.username, pass: password } });
  await smtp.verify().catch(() => {
    throw new AuthError("The SMTP server rejected the app password.");
  });
}

export const ImapConnector: Connector = {
  platform: "imap",
  isConfigured: () => true,

  async listConversations(ctx) {
    const cfg = cfgOf(ctx);
    return withImap(cfg, ctx.tokens.accessToken, async (c) => {
      const sent = await specialFolder(c, "\\Sent");
      const archive = await specialFolder(c, "\\Archive");
      const msgs = [...(await recentFromFolder(c, "INBOX", cfg.email, 120)), ...(sent ? await recentFromFolder(c, sent, cfg.email, 60) : []), ...(archive ? await recentFromFolder(c, archive, cfg.email, 40) : [])];
      return { items: groupImapThreads(msgs, cfg.email, "INBOX") };
    });
  },

  async listMessages() {
    // Threads come complete from listConversations.
    return { items: [] };
  },

  attachmentLimits: { perFile: 20 * 1024 * 1024, total: 20 * 1024 * 1024 },

  async send(ctx, msg) {
    const cfg = cfgOf(ctx);
    await assertPublicHost(cfg.smtpHost);
    const mail = {
      from: cfg.email,
      to: msg.to,
      cc: msg.cc,
      subject: msg.subject ?? "",
      text: msg.body,
      inReplyTo: msg.inReplyTo?.messageExternalId,
      references: msg.inReplyTo ? [msg.inReplyTo.references, msg.inReplyTo.messageExternalId].filter(Boolean).join(" ") : undefined,
      attachments: (msg.attachments ?? []).map((a) => ({ filename: a.name, content: a.data, contentType: a.mimeType })),
    };
    const raw = await new MailComposer(mail).compile().build();
    const parsed = await simpleParser(raw);
    const smtp = nodemailer.createTransport({ host: cfg.smtpHost, port: cfg.smtpPort, secure: cfg.smtpPort === 465, requireTLS: true, auth: { user: cfg.username, pass: ctx.tokens.accessToken } });
    try {
      await smtp.sendMail({ envelope: { from: cfg.email, to: [...msg.to, ...(msg.cc ?? [])] }, raw });
    } catch (e) {
      const code = (e as { responseCode?: number }).responseCode ?? 0;
      if (code === 535) throw new AuthError("The SMTP server rejected the app password.");
      throw new ConnectorError(`SMTP send failed${code ? ` (${code})` : ""}.`, code >= 400 && code < 500);
    }
    // Most IMAP servers don't file SMTP mail automatically; keep a copy in Sent.
    await withImap(cfg, ctx.tokens.accessToken, async (c) => {
      const sent = await specialFolder(c, "\\Sent");
      if (sent) await c.append(sent, raw, ["\\Seen"]);
    }).catch(() => undefined);
    const id = cleanId(parsed.messageId) ?? `sent:${Date.now()}`;
    return { externalMessageId: id, externalConversationId: msg.externalConversationId ?? id, sentAt: new Date().toISOString() };
  },

  async markRead(ctx, root) {
    await withImap(cfgOf(ctx), ctx.tokens.accessToken, async (c) => {
      const lock = await c.getMailboxLock("INBOX");
      try {
        const uids = await threadUids(c, root);
        if (uids.length) await c.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
      } finally {
        lock.release();
      }
    });
  },

  async archive(ctx, root, archived) {
    await withImap(cfgOf(ctx), ctx.tokens.accessToken, async (c) => {
      const archive = await specialFolder(c, "\\Archive");
      if (!archive) throw new ConnectorError("This mailbox has no Archive folder.", false);
      const from = archived ? "INBOX" : archive;
      const lock = await c.getMailboxLock(from);
      try {
        const uids = await threadUids(c, root);
        if (uids.length) await c.messageMove(uids, archived ? archive : "INBOX", { uid: true });
      } finally {
        lock.release();
      }
    });
  },

  async downloadAttachment(ctx, _messageId, att) {
    const [folder, uid, index] = (att.externalId ?? "").split("|");
    if (!folder || !uid) throw new ConnectorError("This attachment can't be downloaded.", false);
    return withImap(cfgOf(ctx), ctx.tokens.accessToken, async (c) => {
      const lock = await c.getMailboxLock(folder);
      try {
        const m = await c.fetchOne(uid, { source: true }, { uid: true });
        if (!m || !m.source) throw new ConnectorError("The message is no longer on the server.", false);
        const a = (await simpleParser(m.source)).attachments.filter((x) => x.contentDisposition !== "inline")[Number(index)];
        if (!a) throw new ConnectorError("Attachment not found.", false);
        return { data: a.content, mimeType: a.contentType, name: a.filename ?? att.name };
      } finally {
        lock.release();
      }
    });
  },
};
