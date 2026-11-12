import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildRawEmail, decodeBase64Url, encodeBase64Url, extractBody, normalizeGmailThread, parseAddress, splitAddresses, stripQuotedReply, type GmailMessage } from "@/server/connectors/gmail";
import { slackToText, slackTsToIso, verifySlackSignature } from "@/server/connectors/slack";
import { normalizeTelegramUpdate } from "@/server/connectors/telegram";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

describe("gmail", () => {
  it("parses addresses", () => {
    expect(parseAddress('"Rahul Mehta" <Rahul.Mehta@LumenLabs.io>')).toEqual({ name: "Rahul Mehta", email: "rahul.mehta@lumenlabs.io" });
    expect(parseAddress("plain@x.com")).toEqual({ name: "plain@x.com", email: "plain@x.com" });
    expect(splitAddresses('"Doe, Jane" <j@x.com>, b@y.com')).toEqual(['"Doe, Jane" <j@x.com>', "b@y.com"]);
  });

  it("extracts text, falls back to HTML, and lists attachments", () => {
    const part = {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "multipart/alternative", parts: [{ mimeType: "text/html", body: { data: b64("<p>Hello <b>there</b></p><p>Line 2</p>") } }] },
        { mimeType: "application/pdf", filename: "role.pdf", body: { attachmentId: "att1", size: 2048 } },
      ],
    };
    const out = extractBody(part);
    expect(out.text).toBe("Hello there\nLine 2");
    expect(out.attachments).toEqual([{ externalId: "att1", name: "role.pdf", mimeType: "application/pdf", size: 2048 }]);
  });

  it("strips quoted reply history", () => {
    expect(stripQuotedReply("Sounds good!\n\nOn Tue, Nov 10, 2026 at 9:00 AM Rahul wrote:\n> earlier")).toBe("Sounds good!");
  });

  it("normalizes a thread: participants exclude the owner, sent mail is 'me', unread counted", () => {
    const owner = "alex@gmail.com";
    const messages: GmailMessage[] = [
      { id: "m1", threadId: "t1", internalDate: "1700000000000", labelIds: ["INBOX", "UNREAD"], payload: { mimeType: "text/plain", headers: [{ name: "From", value: "Rahul <rahul@lumen.io>" }, { name: "To", value: owner }, { name: "Subject", value: "Internship" }, { name: "Message-ID", value: "<a@lumen.io>" }], body: { data: b64("Hi Alex") } } },
      { id: "m2", threadId: "t1", internalDate: "1700000100000", labelIds: ["SENT"], payload: { mimeType: "text/plain", headers: [{ name: "From", value: `Alex <${owner}>` }, { name: "To", value: "rahul@lumen.io" }, { name: "Subject", value: "Re: Internship" }], body: { data: b64("Thanks!") } } },
    ];
    const conv = normalizeGmailThread({ id: "t1", messages }, owner);
    expect(conv.title).toBe("Internship");
    expect(conv.participants.map((p) => p.handle)).toEqual(["rahul@lumen.io"]);
    expect(conv.unreadCount).toBe(1);
    expect(conv.messages?.map((m) => m.authorExternalId)).toEqual(["rahul@lumen.io", "me"]);
    expect(conv.messages?.[0].metadata?.messageIdHeader).toBe("<a@lumen.io>");
    expect(conv.metadata).toMatchObject({ archived: false });
  });

  it("builds a valid RFC 5322 reply with encoded non-ASCII subject", () => {
    const raw = buildRawEmail({ from: "a@x.com", to: ["b@y.com"], subject: "Re: Café ☕", body: "Héllo", inReplyTo: "<m1@y.com>", references: "<m0@y.com>" });
    expect(raw).toContain("Subject: =?UTF-8?B?");
    expect(raw).toContain("In-Reply-To: <m1@y.com>");
    expect(raw).toContain("References: <m0@y.com> <m1@y.com>");
    const body = raw.split("\r\n\r\n")[1].replace(/\r\n/g, "");
    expect(Buffer.from(body, "base64").toString("utf8")).toBe("Héllo");
    expect(decodeBase64Url(encodeBase64Url(raw))).toBe(raw);
  });
});

describe("slack", () => {
  const secret = "8f742231b10e8888abcd99yyyzzz85a5";
  const body = "token=xyz&team_id=T1";
  const ts = "1700000000";
  const sig = `v0=${createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex")}`;
  it("accepts a valid signature inside the replay window", () => {
    expect(verifySlackSignature({ signingSecret: secret, timestamp: ts, signature: sig, rawBody: body, now: 1700000100_000 })).toBe(true);
  });
  it("rejects replays and tampering", () => {
    expect(verifySlackSignature({ signingSecret: secret, timestamp: ts, signature: sig, rawBody: body, now: 1700001000_000 })).toBe(false);
    expect(verifySlackSignature({ signingSecret: secret, timestamp: ts, signature: sig, rawBody: body + "x", now: 1700000100_000 })).toBe(false);
    expect(verifySlackSignature({ signingSecret: secret, timestamp: null, signature: sig, rawBody: body })).toBe(false);
  });
  it("renders mrkdwn mentions, channels and links", () => {
    expect(slackToText("<@U1> see <#C1|design> and <https://x.io|the doc> &amp; more", { U1: "Leo" })).toBe("@Leo see #design and the doc (https://x.io) & more");
    expect(slackTsToIso("1700000000.000200")).toBe("2023-11-14T22:13:20.000Z");
  });
});

describe("telegram", () => {
  it("normalizes a private message to the bot", () => {
    const out = normalizeTelegramUpdate({ update_id: 1, message: { message_id: 7, from: { id: 42, first_name: "Marco", last_name: "Rossi", username: "marcorossi" }, chat: { id: 42, type: "private", first_name: "Marco", last_name: "Rossi" }, date: 1700000000, text: "Hello" } }, 999);
    expect(out?.conversation).toMatchObject({ externalId: "42", kind: "dm", title: "Marco Rossi", unreadCount: 1 });
    expect(out?.message).toMatchObject({ externalId: "7", authorExternalId: "42", body: "Hello" });
  });
  it("marks the bot's own messages as 'me' and keeps documents", () => {
    const out = normalizeTelegramUpdate({ update_id: 2, message: { message_id: 8, from: { id: 999, is_bot: true, first_name: "Bot" }, chat: { id: -100, type: "group", title: "Crew" }, date: 1700000000, caption: "itinerary", document: { file_id: "f1", file_name: "plan.pdf", mime_type: "application/pdf", file_size: 10 } } }, 999);
    expect(out?.conversation.kind).toBe("group");
    expect(out?.message.authorExternalId).toBe("me");
    expect(out?.message.attachments[0]).toMatchObject({ name: "plan.pdf", mimeType: "application/pdf" });
  });
  it("ignores updates without messages", () => {
    expect(normalizeTelegramUpdate({ update_id: 3 }, 1)).toBeNull();
  });
});

import { identityFor } from "@/server/identity";

describe("contact identity matching", () => {
  it("uses the email address (platform-agnostic) for email accounts", () => {
    expect(identityFor("gmail", "sub1", { externalId: "Rahul@Lumen.io" })).toEqual({ kind: "email", platform_id: null, value: "rahul@lumen.io" });
    expect(identityFor("outlook", "x", { externalId: "id", handle: "rahul@lumen.io" })?.value).toBe("rahul@lumen.io");
  });
  it("scopes Slack users by team so U123 in two workspaces are different people", () => {
    expect(identityFor("slack", "T1:U9", { externalId: "U123" })?.value).toBe("T1:U123");
    expect(identityFor("slack", "T2:U9", { externalId: "U123" })?.value).toBe("T2:U123");
  });
  it("never derives an identity from a display name", () => {
    expect(identityFor("gmail", "sub1", { externalId: "Rahul Mehta" })).toBeNull();
  });
});

import { groupGraphConversations, isPersonalMicrosoftAddress, type GraphMessage } from "@/server/connectors/outlook";

describe("outlook (microsoft graph)", () => {
  const owner = "alex@contoso.com";
  const msgs: GraphMessage[] = [
    { id: "a", conversationId: "C1", subject: "Budget review", from: { emailAddress: { name: "Nina", address: "Nina@Halcyon.com" } }, toRecipients: [{ emailAddress: { address: owner } }], receivedDateTime: "2026-11-10T09:00:00Z", isRead: false, body: { contentType: "text", content: "Can you review?\r\n\r\nOn Mon, Nov 9 Alex wrote:\r\n> old" }, parentFolderId: "INBOX", importance: "high" },
    { id: "b", conversationId: "C1", subject: "RE: Budget review", from: { emailAddress: { name: "Alex", address: owner } }, toRecipients: [{ emailAddress: { address: "nina@halcyon.com" } }], sentDateTime: "2026-11-10T10:00:00Z", isRead: true, body: { contentType: "text", content: "Done." }, parentFolderId: "SENT" },
    { id: "c", conversationId: "C2", subject: "Old thread", from: { emailAddress: { address: "x@y.com" } }, receivedDateTime: "2026-11-01T09:00:00Z", isRead: true, parentFolderId: "ARCHIVE", bodyPreview: "preview" },
  ];
  it("groups by conversation, newest first, with participants excluding the owner", () => {
    const convs = groupGraphConversations(msgs, owner, "INBOX");
    expect(convs.map((c) => c.externalId)).toEqual(["C1", "C2"]);
    expect(convs[0]).toMatchObject({ title: "Budget review", unreadCount: 1, participants: [{ handle: "nina@halcyon.com" }], metadata: { archived: false, important: true } });
    expect(convs[0].messages?.map((m) => [m.authorExternalId, m.body])).toEqual([["nina@halcyon.com", "Can you review?"], ["me", "Done."]]);
    expect(convs[1].metadata).toMatchObject({ archived: true });
    expect(convs[1].messages?.[0].body).toBe("preview");
  });
  it("labels personal Microsoft accounts", () => {
    expect(isPersonalMicrosoftAddress("me@outlook.com")).toBe(true);
    expect(isPersonalMicrosoftAddress("me@hotmail.co.uk")).toBe(true);
    expect(isPersonalMicrosoftAddress("me@contoso.com")).toBe(false);
  });
});

import { filenameParams } from "@/server/connectors/gmail";

describe("gmail attachments (MIME)", () => {
  it("builds multipart/mixed with base64 parts and RFC 2231 filenames", () => {
    const raw = buildRawEmail({
      from: "a@x.com",
      to: ["b@y.com"],
      subject: "Files",
      body: "See attached",
      boundary: "BOUNDARY",
      attachments: [{ name: "Résumé (final).pdf", mimeType: "application/pdf", data: Buffer.from("%PDF-1.7 fake") }],
    });
    expect(raw).toContain('Content-Type: multipart/mixed; boundary="BOUNDARY"');
    expect(raw).toContain("--BOUNDARY--");
    expect(raw).toContain("filename*=UTF-8''R%C3%A9sum%C3%A9%20%28final%29.pdf");
    const part = raw.split("--BOUNDARY")[2];
    const b64 = part.split("\r\n\r\n")[1].replace(/\r\n/g, "");
    expect(Buffer.from(b64, "base64").toString()).toBe("%PDF-1.7 fake");
  });
  it("escapes quotes in the ASCII filename fallback", () => {
    expect(filenameParams('a"b.txt')).toMatch(/^filename="a_b\.txt"/);
  });
});

import { normalizeTeamsChat, normalizeTeamsMessage } from "@/server/connectors/teams";

describe("microsoft teams", () => {
  const me = "u-me";
  it("titles 1:1 chats by the other person and flags unread from the viewpoint", () => {
    const c = normalizeTeamsChat(
      { id: "19:abc", chatType: "oneOnOne", members: [{ userId: me, displayName: "Alex" }, { userId: "u-p", displayName: "Priya Sharma", email: "priya@contoso.com" }], lastMessagePreview: { createdDateTime: "2026-11-12T10:00:00Z", from: { user: { id: "u-p" } } }, viewpoint: { lastMessageReadDateTime: "2026-11-12T09:00:00Z" } },
      me,
    );
    expect(c).toMatchObject({ kind: "dm", title: "Priya Sharma", unreadCount: 1, participants: [{ externalId: "u-p", handle: "priya@contoso.com" }] });
  });
  it("uses the topic for group chats and isn't unread when the last message is mine", () => {
    const c = normalizeTeamsChat({ id: "19:g", chatType: "group", topic: "Launch crew", members: [{ userId: me }, { userId: "a" }, { userId: "b" }], lastMessagePreview: { createdDateTime: "2026-11-12T10:00:00Z", from: { user: { id: me } } } }, me);
    expect(c).toMatchObject({ kind: "group", title: "Launch crew", unreadCount: 0 });
  });
  it("converts HTML bodies, marks own messages and drops system events", () => {
    expect(normalizeTeamsMessage({ id: "1", messageType: "message", createdDateTime: "2026-11-12T10:00:00Z", from: { user: { id: me } }, body: { contentType: "html", content: "<p>Ship it <b>today</b></p>" } }, me)).toMatchObject({ authorExternalId: "me", body: "Ship it today" });
    expect(normalizeTeamsMessage({ id: "2", messageType: "systemEventMessage", createdDateTime: "2026-11-12T10:00:00Z" }, me)).toBeNull();
    expect(normalizeTeamsMessage({ id: "3", messageType: "message", createdDateTime: "2026-11-12T10:00:00Z", deletedDateTime: "2026-11-12T10:05:00Z" }, me)).toBeNull();
  });
});

import { normalizeMessagingEvent, normalizeWhatsApp, replyMode, verifyMetaSignature } from "@/server/connectors/meta";

describe("meta business messaging", () => {
  it("verifies X-Hub-Signature-256 against any configured app secret", () => {
    const body = '{"object":"page"}';
    const sig = `sha256=${createHmac("sha256", "ig-secret").update(body).digest("hex")}`;
    expect(verifyMetaSignature(body, sig, ["fb-secret", "ig-secret"])).toBe(true);
    expect(verifyMetaSignature(body + " ", sig, ["fb-secret", "ig-secret"])).toBe(false);
    expect(verifyMetaSignature(body, null, ["ig-secret"])).toBe(false);
  });

  it("keys Messenger/Instagram conversations by the customer and treats echoes as mine", () => {
    const inbound = normalizeMessagingEvent({ sender: { id: "PSID1" }, recipient: { id: "PAGE" }, timestamp: 1700000000000, message: { mid: "m1", text: "Are prints available?" } }, "PAGE", "instagram");
    expect(inbound?.conversation).toMatchObject({ externalId: "PSID1", unreadCount: 1 });
    expect(inbound?.message).toMatchObject({ authorExternalId: "PSID1", body: "Are prints available?" });
    const echo = normalizeMessagingEvent({ sender: { id: "PAGE" }, recipient: { id: "PSID1" }, timestamp: 1700000001000, message: { mid: "m2", text: "Yes!", is_echo: true } }, "PAGE", "instagram");
    expect(echo?.conversation.externalId).toBe("PSID1");
    expect(echo?.message.authorExternalId).toBe("me");
  });

  it("normalizes WhatsApp messages with profile names, media and receipts", () => {
    const out = normalizeWhatsApp({
      metadata: { phone_number_id: "PN1" },
      contacts: [{ wa_id: "14155550161", profile: { name: "Sam Whitfield" } }],
      messages: [
        { from: "14155550161", id: "wamid.1", timestamp: "1700000000", type: "text", text: { body: "Do you take brand projects?" } },
        { from: "14155550161", id: "wamid.2", timestamp: "1700000060", type: "document", document: { id: "MEDIA1", filename: "brief.pdf", mime_type: "application/pdf" } },
      ],
      statuses: [{ id: "wamid.out", status: "read", recipient_id: "14155550161", timestamp: "1700000100" }],
    });
    expect(out.messages[0].conversation).toMatchObject({ externalId: "14155550161", title: "Sam Whitfield" });
    expect(out.messages[1].message.attachments[0]).toMatchObject({ externalId: "MEDIA1", name: "brief.pdf" });
    expect(out.statuses).toEqual([{ externalId: "wamid.out", status: "read" }]);
  });

  it("enforces the 24-hour window, with a 7-day Human Agent extension only when enabled", () => {
    const now = Date.UTC(2026, 10, 12);
    expect(replyMode(now - 3_600_000, now, false)).toEqual({ ok: true });
    expect(replyMode(now - 2 * 86_400_000, now, false).ok).toBe(false);
    expect(replyMode(now - 2 * 86_400_000, now, true)).toEqual({ ok: true, tag: "HUMAN_AGENT" });
    expect(replyMode(now - 8 * 86_400_000, now, true).ok).toBe(false);
    expect(replyMode(undefined, now, true).ok).toBe(false);
  });
});
