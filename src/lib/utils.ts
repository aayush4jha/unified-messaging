import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isThisYear,
  isToday,
  isYesterday,
} from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(prefix = "id"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rand}`;
}

/** UUID for records that may be persisted server-side (reminders, drafts, labels…). */
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // RFC 4122 v4 fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Compact timestamp for list rows: 9:41, Yesterday, Mon, Oct 3, 3/14/24 */
export function formatListTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  const days = differenceInCalendarDays(now, d);
  if (days < 7 && days > 0) return format(d, "EEE");
  if (isThisYear(d)) return format(d, "MMM d");
  return format(d, "M/d/yy");
}

/** Timestamp shown in message headers. */
export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return `Yesterday, ${format(d, "h:mm a")}`;
  if (isThisYear(d)) return format(d, "EEE, MMM d · h:mm a");
  return format(d, "MMM d, yyyy · h:mm a");
}

export function formatDayDivider(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (isThisYear(d)) return format(d, "EEEE, MMMM d");
  return format(d, "MMMM d, yyyy");
}

export function formatRelative(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}

export function formatDue(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = differenceInCalendarDays(d, now);
  if (isToday(d)) return `Today, ${format(d, "h:mm a")}`;
  if (days === 1) return `Tomorrow, ${format(d, "h:mm a")}`;
  if (days === -1) return `Yesterday, ${format(d, "h:mm a")}`;
  if (days > 1 && days < 7) return format(d, "EEEE, h:mm a");
  return format(d, "MMM d, h:mm a");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic hue from a string, used for avatar tints. */
export function hueFromString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function isMac(): boolean {
  if (typeof navigator === "undefined") return true;
  return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
}

export function modKey(): string {
  return isMac() ? "⌘" : "Ctrl";
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function stripQuoted(body: string): string {
  return body.split(/\n>|\nOn .* wrote:/)[0].trim();
}
