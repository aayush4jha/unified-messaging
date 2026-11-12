/**
 * Text signals shared by prioritization, follow-up detection and briefings.
 * Pure functions, no I/O, deterministic — easy to unit test.
 */
import type { Message } from "../types";

const AUTOMATED_PATTERNS = [
  /\bno-?reply\b/i,
  /\bdo(?:n't| not) reply\b/i,
  /\bautomated message\b/i,
  /\bunsubscribe\b/i,
  /\bnewsletter\b/i,
  /\bstatement is (?:now )?(?:ready|available)\b/i,
  /\bthis week:/i,
];

const AUTOMATED_SENDER = /(no-?reply|notifications?|statements?|hello|news|digest|billing|ap)@/i;

export function looksAutomated(body: string, senderHandle?: string, title?: string): boolean {
  const text = `${title ?? ""}\n${body}`;
  if (AUTOMATED_PATTERNS.some((re) => re.test(text))) return true;
  if (senderHandle && AUTOMATED_SENDER.test(senderHandle) && !/\?/.test(body)) return true;
  return false;
}

const REQUEST_PATTERNS = [
  /\?/,
  /\b(?:could|can|would|will) you\b/i,
  /\bplease\b/i,
  /\blet me know\b/i,
  /\bany chance\b/i,
  /\bneed (?:your|you to)\b/i,
  /\bconfirm\b/i,
];

export function isRequest(body: string): boolean {
  return REQUEST_PATTERNS.some((re) => re.test(body));
}

const URGENT_PATTERNS = [/\burgent\b/i, /\basap\b/i, /\bimmediately\b/i, /\btoday\b/i, /\bblocking\b/i, /\bemergency\b/i];

export function isUrgent(body: string): boolean {
  return URGENT_PATTERNS.some((re) => re.test(body));
}

const COMMITMENT_PATTERNS = [/\bI(?:'ll| will)\b/i, /\bwill do\b/i, /\blet me (?:check|get back)\b/i, /\bI can (?:send|share|get)\b/i];

export function isCommitment(body: string): boolean {
  return COMMITMENT_PATTERNS.some((re) => re.test(body));
}

export function mentionsSelf(body: string, selfNames: string[]): boolean {
  return selfNames.some((n) => new RegExp(`@${escapeRegExp(n)}\\b`, "i").test(body));
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export interface DeadlineHit {
  phrase: string;
  dueAt: string;
}

/**
 * Finds the first explicit deadline phrase ("by Thursday", "by November 20",
 * "by Wednesday EOD", "tomorrow") and resolves it relative to `sentAt`.
 */
export function findDeadline(body: string, sentAt: string): DeadlineHit | null {
  const base = new Date(sentAt);
  const lower = body.toLowerCase();

  const monthDay = lower.match(
    /\bby (jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?) (\d{1,2})\b/,
  );
  if (monthDay) {
    const month = MONTHS.indexOf(monthDay[1].slice(0, 3));
    const day = Number(monthDay[2]);
    const d = new Date(base);
    d.setMonth(month, day);
    d.setHours(17, 0, 0, 0);
    if (d.getTime() < base.getTime() - 86_400_000) d.setFullYear(d.getFullYear() + 1);
    return { phrase: monthDay[0], dueAt: d.toISOString() };
  }

  const weekday = lower.match(/\bby (sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?: (?:eod|end of day|morning|afternoon))?\b/);
  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[1]);
    const d = new Date(base);
    let add = (target - d.getDay() + 7) % 7;
    if (add === 0) add = 7;
    d.setDate(d.getDate() + add);
    d.setHours(/morning/.test(weekday[0]) ? 10 : 17, 0, 0, 0);
    return { phrase: weekday[0], dueAt: d.toISOString() };
  }

  const relative = lower.match(/\b(by (?:tomorrow|tonight|eod|end of (?:the )?day|end of (?:the )?week)|before (?:monday|friday)'?s?[\w ]*)\b/);
  if (relative) {
    const d = new Date(base);
    if (/tomorrow/.test(relative[0])) d.setDate(d.getDate() + 1);
    if (/week|friday/.test(relative[0])) d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
    if (/monday/.test(relative[0])) d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7 || 7));
    d.setHours(/tonight/.test(relative[0]) ? 21 : 17, 0, 0, 0);
    return { phrase: relative[0], dueAt: d.toISOString() };
  }

  return null;
}

export function lastInbound(messages: Message[]): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].authorId !== "me") return messages[i];
  return undefined;
}

export function lastOutbound(messages: Message[]): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].authorId === "me") return messages[i];
  return undefined;
}
