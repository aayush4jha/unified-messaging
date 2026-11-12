/**
 * Notification policy: decides whether an incoming event should interrupt the
 * user, and why not when it shouldn't. Used for real-time events from
 * connectors and for the "send test notification" action in Settings.
 */
import type { Account, AppNotification, Conversation, Priority } from "./types";

export interface NotifyPrefs {
  doNotDisturb: boolean;
  quietHours: { enabled: boolean; start: string; end: string };
  priorityOnlyNotifications: boolean;
  desktopNotifications: boolean;
}

export type NotifyDecision = { deliver: true; interrupt: boolean; reason?: string } | { deliver: false; reason: string };

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function inQuietHours(q: NotifyPrefs["quietHours"], at = new Date()): boolean {
  if (!q.enabled) return false;
  const now = at.getHours() * 60 + at.getMinutes();
  const start = minutes(q.start);
  const end = minutes(q.end);
  return start <= end ? now >= start && now < end : now >= start || now < end;
}

/**
 * Every event is recorded in the notification center (deliver), but only some
 * interrupt (toast / desktop notification).
 */
export function decide(
  n: Pick<AppNotification, "kind">,
  ctx: { prefs: NotifyPrefs; account?: Account; conversation?: Conversation; priority?: Priority; at?: Date },
): NotifyDecision {
  if (ctx.account && !ctx.account.notificationsEnabled) return { deliver: false, reason: `Notifications are off for ${ctx.account.label}` };
  if (ctx.conversation?.muted) return { deliver: false, reason: "Conversation is muted" };
  const urgent = n.kind === "priority" || n.kind === "reminder" || ctx.priority === "high";
  if (ctx.prefs.doNotDisturb) return { deliver: true, interrupt: false, reason: "Do Not Disturb is on" };
  if (inQuietHours(ctx.prefs.quietHours, ctx.at) && !urgent) return { deliver: true, interrupt: false, reason: "Quiet hours" };
  if (ctx.prefs.priorityOnlyNotifications && !urgent && n.kind !== "system") return { deliver: true, interrupt: false, reason: "Only priority notifications interrupt" };
  return { deliver: true, interrupt: true };
}

/**
 * Shows a system notification. Goes through the service worker when one is
 * active (required on Android, where `new Notification()` throws; taps are
 * routed by the worker to `url`), otherwise uses the page Notification API.
 */
export async function showDesktopNotification(title: string, body: string, opts?: { url?: string; tag?: string; onClick?: () => void }): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  const tag = opts?.tag ?? `orbit-${title}`;
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg?.active) {
      await reg.showNotification(title, { body, tag, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png", data: { url: opts?.url ?? "/inbox" } });
      return true;
    }
    const n = new Notification(title, { body, tag, silent: false });
    if (opts?.onClick) n.onclick = () => (window.focus(), opts.onClick?.());
    return true;
  } catch {
    return false;
  }
}
