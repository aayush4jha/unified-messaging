import { afterEach, describe, expect, it, vi } from "vitest";
import { GmailConnector } from "@/server/connectors/gmail";
import { OutlookConnector } from "@/server/connectors/outlook";
import { SlackConnector } from "@/server/connectors/slack";
import type { ConnectorContext } from "@/server/connectors/types";

/** Routes mocked fetch calls by URL substring → JSON body (or a Response). */
function mockFetch(routes: [string | RegExp, (url: string, init?: RequestInit) => unknown][]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const hit = routes.find(([m]) => (typeof m === "string" ? url.includes(m) : m.test(url)));
    if (!hit) throw new Error(`unmocked fetch: ${url}`);
    const out = hit[1](url, init);
    return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  });
  return calls;
}

const ctx = (handle: string, extra: Record<string, string> = {}): ConnectorContext => ({
  tokens: { accessToken: "tok", expiresAt: Date.now() + 3_600_000, extra },
  accountHandle: handle,
  saveTokens: async () => undefined,
});

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const thread = (id: string, subject: string) => ({
  id,
  messages: [{ id: `${id}m`, threadId: id, internalDate: "1700000000000", labelIds: ["INBOX", "UNREAD"], payload: { mimeType: "text/plain", headers: [{ name: "From", value: "R <r@x.io>" }, { name: "Subject", value: subject }], body: { data: b64("hello") } } }],
});

afterEach(() => vi.unstubAllGlobals());

describe("gmail incremental sync", () => {
  it("fetches only threads touched since the stored historyId and advances it", async () => {
    const calls = mockFetch([
      ["/history?", () => ({ historyId: "205", history: [{ messagesAdded: [{ message: { threadId: "t1" } }] }, { labelsRemoved: [{ message: { threadId: "t2" } }] }, { messagesAdded: [{ message: { threadId: "t1" } }] }] })],
      ["/threads/t1", () => thread("t1", "One")],
      ["/threads/t2", () => thread("t2", "Two")],
    ]);
    const r = await GmailConnector.incremental!(ctx("me@x.io"), { historyId: "100" });
    expect(r.items.map((c) => c.externalId)).toEqual(["t1", "t2"]);
    expect(r.cursor.historyId).toBe("205");
    expect(calls.filter((c) => c.url.includes("/threads/")).length).toBe(2);
  });

  it("falls back to a full resync when the historyId has expired (404)", async () => {
    mockFetch([
      ["/history?", () => new Response("{}", { status: 404 })],
      ["/profile", () => ({ historyId: "999" })],
      ["/threads?", () => ({ threads: [{ id: "t9" }] })],
      ["/threads/t9", () => thread("t9", "Nine")],
    ]);
    const r = await GmailConnector.incremental!(ctx("me@x.io"), { historyId: "1" });
    expect(r.items.map((c) => c.externalId)).toEqual(["t9"]);
    expect(r.cursor.historyId).toBe("999");
  });

  it("skips push setup when no Pub/Sub topic is configured", async () => {
    expect(await GmailConnector.subscribe!(ctx("me@x.io"), { notificationUrl: "https://o/api/webhooks/gmail", secret: "s" })).toBeNull();
  });
});

describe("outlook delta + subscriptions", () => {
  it("collects changed conversations across delta pages and stores the deltaLink", async () => {
    mockFetch([
      [/mailFolders\/inbox\/messages\/delta/, () => ({ value: [{ id: "a", conversationId: "C1" }, { id: "x", "@removed": { reason: "deleted" } }], "@odata.nextLink": "https://graph.microsoft.com/v1.0/next-inbox" })],
      ["next-inbox", () => ({ value: [{ id: "b", conversationId: "C2" }], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/delta-inbox" })],
      [/mailFolders\/sentitems\/messages\/delta/, () => ({ value: [{ id: "c", conversationId: "C1" }], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/delta-sent" })],
      [/mailFolders\/inbox\?/, () => ({ id: "INBOX" })],
      [/conversationId eq 'C1'/, () => ({ value: [{ id: "a", conversationId: "C1", subject: "One", from: { emailAddress: { address: "n@h.com" } }, receivedDateTime: "2026-11-10T09:00:00Z", isRead: false, parentFolderId: "INBOX", body: { contentType: "text", content: "hi" } }] })],
      [/conversationId eq 'C2'/, () => ({ value: [{ id: "b", conversationId: "C2", subject: "Two", from: { emailAddress: { address: "m@h.com" } }, receivedDateTime: "2026-11-11T09:00:00Z", isRead: true, parentFolderId: "INBOX", body: { contentType: "text", content: "yo" } }] })],
    ]);
    const r = await OutlookConnector.incremental!(ctx("me@contoso.com"), {});
    expect(r.items.map((c) => c.externalId).sort()).toEqual(["C1", "C2"]);
    expect(r.cursor.deltaLinks).toEqual({ inbox: "https://graph.microsoft.com/v1.0/delta-inbox", sentitems: "https://graph.microsoft.com/v1.0/delta-sent" });
  });

  it("reuses a fresh subscription and creates one with clientState when missing", async () => {
    const fresh = { id: "sub1", expiresAt: Date.now() + 3 * 86_400_000 };
    expect(await OutlookConnector.subscribe!(ctx("me@contoso.com"), { notificationUrl: "https://o/api/webhooks/outlook", secret: "s3cret", existing: fresh })).toBe(fresh);

    const calls = mockFetch([["/subscriptions", (_u, init) => ({ id: "sub2", expirationDateTime: new Date(Date.now() + 6 * 86_400_000).toISOString(), echo: init?.body })]]);
    const created = await OutlookConnector.subscribe!(ctx("me@contoso.com"), { notificationUrl: "https://o/api/webhooks/outlook", secret: "s3cret" });
    expect(created).toMatchObject({ id: "sub2" });
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ clientState: "s3cret", resource: "me/mailFolders('inbox')/messages", changeType: "created,updated" });
  });
});

describe("slack file upload (v2)", () => {
  it("reserves an upload URL, uploads bytes, then completes with typed JSON params", async () => {
    const calls = mockFetch([
      ["files.getUploadURLExternal", () => ({ ok: true, upload_url: "https://files.slack.com/upload/v1/abc", file_id: "F1" })],
      ["files.slack.com/upload", () => new Response("OK", { status: 200 })],
      ["files.completeUploadExternal", () => ({ ok: true, files: [{ id: "F1", shares: { public: { C9: [{ ts: "1700000000.000100" }] } } }] })],
    ]);
    const r = await SlackConnector.send(ctx("team.slack.com", { userId: "U1" }), { clientId: "c1", externalConversationId: "C9", to: [], body: "see file", attachments: [{ name: "a.pdf", mimeType: "application/pdf", data: Buffer.from("pdf") }] });
    expect(r).toMatchObject({ externalMessageId: "1700000000.000100", externalConversationId: "C9" });
    const complete = calls.find((c) => c.url.includes("completeUploadExternal"))!;
    expect(JSON.parse(String(complete.init?.body)).files).toEqual([{ id: "F1", title: "a.pdf" }]);
  });
});
