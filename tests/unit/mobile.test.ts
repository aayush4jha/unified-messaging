import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock("next/server", () => ({ after: () => { throw new Error("outside request scope"); } }));

const { isAllowedPushEndpoint, shouldPush, wallClock } = await import("@/server/push");
const { detectIosBrowser, detectPlatform } = await import("@/lib/pwa");
const { shareToDraft } = await import("@/components/pwa/share-handler");
const { Outbox } = await import("@/lib/outbox");

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0";
const IPAD_DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36";

describe("device detection", () => {
  it("tells iOS, Android and desktop apart, including iPadOS's desktop user agent", () => {
    expect(detectPlatform(IPHONE_SAFARI)).toBe("ios");
    expect(detectPlatform(ANDROID_CHROME)).toBe("android");
    expect(detectPlatform(IPAD_DESKTOP_UA, 5)).toBe("ios");
    expect(detectPlatform(IPAD_DESKTOP_UA, 0)).toBe("desktop");
  });

  it("knows which iOS browsers can Add to Home Screen", () => {
    expect(detectIosBrowser(IPHONE_SAFARI)).toBe("safari");
    expect(detectIosBrowser(IPHONE_CHROME)).toBe("other-browser");
    expect(detectIosBrowser(IPHONE_INSTAGRAM)).toBe("in-app");
  });
});

describe("web push", () => {
  it("only accepts endpoints on real browser push services (no SSRF)", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc:def")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QGx1")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/gAAA")).toBe(true);
    expect(isAllowedPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://evilpush.apple.com.attacker.io/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://user:pw@fcm.googleapis.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("not a url")).toBe(false);
  });

  it("evaluates quiet hours in each device's own time zone", () => {
    const at = new Date("2026-11-12T17:30:00Z"); // 23:00 in Kolkata, 12:30 in New York
    expect(wallClock("Asia/Kolkata", at).getHours()).toBe(23);
    expect(wallClock("Asia/Kolkata", at).getMinutes()).toBe(0);
    expect(wallClock("America/New_York", at).getHours()).toBe(12);
    const prefs = { quietHours: { enabled: true, start: "22:00", end: "07:00" } };
    expect(shouldPush("message", prefs, { timeZone: "Asia/Kolkata", at })).toBe(false);
    expect(shouldPush("message", prefs, { timeZone: "America/New_York", at })).toBe(true);
    // Priority and reminders still break through quiet hours.
    expect(shouldPush("reminder", prefs, { timeZone: "Asia/Kolkata", at })).toBe(true);
  });

  it("respects Do Not Disturb, priority-only and muted conversations", () => {
    expect(shouldPush("message", null)).toBe(true);
    expect(shouldPush("message", { doNotDisturb: true })).toBe(false);
    expect(shouldPush("priority", { doNotDisturb: true })).toBe(false);
    expect(shouldPush("message", { priorityOnlyNotifications: true })).toBe(false);
    expect(shouldPush("system", { priorityOnlyNotifications: true })).toBe(true);
    expect(shouldPush("message", null, { muted: true })).toBe(false);
  });

  it("ignores a bad time zone instead of failing", () => {
    const at = new Date("2026-11-12T17:30:00Z");
    expect(wallClock("Not/AZone", at)).toBe(at);
  });
});

describe("share to Orbit", () => {
  it("turns shared text and links into a draft without duplicating the link", () => {
    expect(shareToDraft({ title: "Article", text: "Worth a read", url: "https://x.com/a" })).toEqual({ subject: "Article", body: "Worth a read\n\nhttps://x.com/a" });
    expect(shareToDraft({ text: "See https://x.com/a", url: "https://x.com/a" })).toEqual({ subject: undefined, body: "See https://x.com/a" });
    expect(shareToDraft({ title: "Same", text: "Same" })).toEqual({ subject: undefined, body: "Same" });
    expect(shareToDraft({})).toEqual({ subject: undefined, body: undefined });
  });
});

describe("outbox on a flaky connection", () => {
  const ok = () => Promise.resolve(new Response("{}", { status: 200 }));

  it("keeps edits made offline and sends them when the network returns", async () => {
    let online = false;
    const sent: string[] = [];
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (!online) throw new TypeError("Failed to fetch");
      sent.push(`${init?.method} ${String(url)} ${init?.body}`);
      return ok();
    }) as unknown as typeof fetch;
    const box = new Outbox(fetcher);
    box.request("/api/conversations/c1", "PATCH", { starred: true });
    await box.flush();
    expect(sent).toEqual([]);
    expect(box.pending()).toBe(true);

    // Another edit while offline merges into the queued one.
    box.request("/api/conversations/c1", "PATCH", { archived: true });
    online = true;
    box.online();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toBe('PATCH /api/conversations/c1 {"starred":true,"archived":true}');
    await vi.waitFor(() => expect(box.pending()).toBe(false));
  });

  it("drops edits the server rejects (4xx) but retries 5xx and 429", async () => {
    const statuses = [422, 503, 200];
    const calls: number[] = [];
    const fetcher = vi.fn(async () => {
      const status = statuses.shift() ?? 200;
      calls.push(status);
      return new Response("{}", { status });
    }) as unknown as typeof fetch;
    const rejected = new Outbox(fetcher);
    rejected.request("/api/reminders", "POST", { a: 1 });
    await rejected.flush();
    expect(rejected.pending()).toBe(false);

    const flaky = new Outbox(fetcher);
    flaky.request("/api/reminders", "POST", { b: 2 });
    await flaky.flush();
    expect(flaky.pending()).toBe(true);
    flaky.online();
    await vi.waitFor(() => expect(flaky.pending()).toBe(false));
    expect(calls).toEqual([422, 503, 200]);
  });

  it("a newer edit wins over a retried older one for the same collection item", async () => {
    let fail = true;
    const bodies: unknown[] = [];
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (fail) throw new TypeError("offline");
      bodies.push(JSON.parse(String(init?.body)));
      return ok();
    }) as unknown as typeof fetch;
    const box = new Outbox(fetcher);
    box.collection("reminders", { upserts: [{ id: "r1", title: "old" } as { id: string }], deletes: [] });
    const first = box.flush();
    box.collection("reminders", { upserts: [{ id: "r1", title: "new" } as { id: string }], deletes: [] });
    await first;
    fail = false;
    box.online();
    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ upserts: [{ id: "r1", title: "new" }], deletes: [] });
  });
});
