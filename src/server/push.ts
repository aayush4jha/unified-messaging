import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import webpush from "web-push";
import { decide, type NotifyPrefs } from "@/lib/notify";
import type { AppNotification } from "@/lib/types";

/**
 * Web Push delivery for installed apps and browsers (Android, iOS 16.4+
 * home-screen apps, desktop). Every in-app notification Orbit records also
 * goes to the user's subscribed devices, filtered through the same
 * notification policy the app uses (DND, quiet hours in each device's own time
 * zone, priority-only, muted conversations).
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Same-origin path opened when the notification is tapped. */
  url?: string;
  /** Notifications with the same tag replace each other (one per conversation). */
  tag?: string;
  /** Unread conversations, for the app icon badge. */
  unread?: number;
  ts?: number;
}

type NotificationKind = AppNotification["kind"];

export function vapidConfig(): { subject: string; publicKey: string; privateKey: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || process.env.ORBIT_PUBLIC_URL;
  if (!publicKey || !privateKey || !subject || !/^(https:\/\/|mailto:)/.test(subject)) return null;
  return { subject: subject.replace(/\/$/, ""), publicKey, privateKey };
}

/**
 * Browsers hand out endpoints on their vendor's push service. Anything else is
 * refused: the server POSTs to this URL, so an arbitrary endpoint would be SSRF.
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && !u.port && !u.username && !u.password && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/** A Date whose local hours/minutes are the wall-clock time in `timeZone` (for quiet hours). */
export function wallClock(timeZone: string | null | undefined, at = new Date()): Date {
  if (!timeZone) return at;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(at);
    const d = new Date(at);
    d.setHours(Number(parts.find((p) => p.type === "hour")?.value ?? d.getHours()), Number(parts.find((p) => p.type === "minute")?.value ?? d.getMinutes()), 0, 0);
    return d;
  } catch {
    return at;
  }
}

const DEFAULT_PREFS: NotifyPrefs = { doNotDisturb: false, quietHours: { enabled: false, start: "22:00", end: "07:00" }, priorityOnlyNotifications: false, desktopNotifications: true };

/** Whether this event should interrupt on a device in `timeZone`. Silent events still land in the notification center. */
export function shouldPush(kind: NotificationKind, prefs: Partial<NotifyPrefs> | null | undefined, opts: { muted?: boolean; timeZone?: string | null; at?: Date } = {}): boolean {
  if (opts.muted) return false;
  const p: NotifyPrefs = { ...DEFAULT_PREFS, ...(prefs ?? {}), quietHours: { ...DEFAULT_PREFS.quietHours, ...(prefs?.quietHours ?? {}) } };
  const d = decide({ kind }, { prefs: p, at: wallClock(opts.timeZone, opts.at) });
  return d.deliver && d.interrupt;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  time_zone: string | null;
  failure_count: number;
}

/** Sends to every device the user subscribed. Gone subscriptions (404/410) are removed. */
export async function pushToUser(db: SupabaseClient, userId: string, payload: PushPayload, policy?: { kind: NotificationKind; muted?: boolean }): Promise<{ sent: number; skipped: number; removed: number }> {
  const result = { sent: 0, skipped: 0, removed: 0 };
  const vapid = vapidConfig();
  if (!vapid) return result;
  const { data: subs } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth,time_zone,failure_count").eq("user_id", userId);
  if (!subs?.length) return result;

  let prefs: Partial<NotifyPrefs> | null = null;
  if (policy) {
    const { data } = await db.from("user_preferences").select("prefs").eq("user_id", userId).maybeSingle();
    prefs = (data?.prefs as Partial<NotifyPrefs> | undefined) ?? null;
  }
  if (payload.unread === undefined) {
    const { count } = await db.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("archived", false).gt("unread_count", 0);
    if (typeof count === "number") payload = { ...payload, unread: count };
  }
  const body = JSON.stringify({ ...payload, ts: payload.ts ?? Date.now() });
  const topic = payload.tag?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined;

  await Promise.all(
    (subs as SubscriptionRow[]).map(async (s) => {
      if (!isAllowedPushEndpoint(s.endpoint)) {
        await db.from("push_subscriptions").delete().eq("id", s.id);
        result.removed++;
        return;
      }
      if (policy && !shouldPush(policy.kind, prefs, { muted: policy.muted, timeZone: s.time_zone })) {
        result.skipped++;
        return;
      }
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          vapidDetails: vapid,
          TTL: 6 * 3600,
          urgency: policy?.kind === "priority" || policy?.kind === "reminder" ? "high" : "normal",
          topic,
          timeout: 8000,
        });
        result.sent++;
        await db.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410 || s.failure_count >= 9) {
          await db.from("push_subscriptions").delete().eq("id", s.id);
          result.removed++;
        } else {
          await db.from("push_subscriptions").update({ failure_count: s.failure_count + 1 }).eq("id", s.id);
        }
      }
    }),
  );
  return result;
}

/** Runs after the response is sent when inside a request; otherwise (tests, scripts) fire-and-forget. */
function background(task: () => Promise<unknown>) {
  const run = () => task().catch((e) => console.error("[push]", e));
  try {
    after(run);
  } catch {
    void run();
  }
}

export interface NotificationInsert {
  user_id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  conversation_id?: string;
  account_id?: string;
}

/** Records an in-app notification and pushes it to the user's devices. */
export async function notifyUser(db: SupabaseClient, n: NotificationInsert, opts: { muted?: boolean } = {}) {
  await db.from("notifications").insert(n);
  if (!vapidConfig()) return;
  background(() =>
    pushToUser(db, n.user_id, { title: n.title, body: n.body, url: n.conversation_id ? `/inbox?c=${n.conversation_id}` : "/inbox", tag: n.conversation_id ?? `orbit-${n.kind}` }, { kind: n.kind, muted: opts.muted }),
  );
}
