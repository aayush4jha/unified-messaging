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

export async function showDesktopNotification(title: string, body: string, onClick?: () => void): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  const n = new Notification(title, { body, tag: `orbit-${title}`, silent: false });
  if (onClick) n.onclick = () => (window.focus(), onClick());
  return true;
}
