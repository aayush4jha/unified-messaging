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
