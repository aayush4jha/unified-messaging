/**
 * Communication analytics derived strictly from synced messages.
 * Metrics that can't be computed from the available history are reported as
 * unavailable with a reason instead of being estimated.
 */
import { addDays, format, startOfDay } from "date-fns";
import type { Account, Contact, Conversation, Message, PlatformId } from "../types";

export interface DailyPoint {
  date: string;
  label: string;
  received: number;
  sent: number;
}

export interface Analytics {
  rangeDays: number;
  totals: { received: number; sent: number; conversations: number; awaitingYou: number };
  daily: DailyPoint[];
  byPlatform: { platform: PlatformId; received: number; sent: number }[];
  byAccount: { accountId: string; received: number; sent: number }[];
  responseTime: { medianMinutes: number | null; samples: number; byPlatform: { platform: PlatformId; medianMinutes: number; samples: number }[] };
  topContacts: { contactId: string; name: string; messages: number; lastAt: string }[];
  hourly: { day: number; hour: number; count: number }[];
  earliestMessageAt: string | null;
  coverageDays: number;
}

export function computeAnalytics(input: {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  accounts: Account[];
  contacts: Contact[];
  rangeDays: number;
  now?: number;
}): Analytics {
  const now = input.now ?? Date.now();
  const since = startOfDay(addDays(new Date(now), -(input.rangeDays - 1))).getTime();
  const convById = new Map(input.conversations.map((c) => [c.id, c]));
  const contactById = new Map(input.contacts.map((c) => [c.id, c]));

  const days: DailyPoint[] = [];
  for (let i = 0; i < input.rangeDays; i++) {
    const d = addDays(new Date(since), i);
    days.push({ date: format(d, "yyyy-MM-dd"), label: format(d, input.rangeDays > 14 ? "MMM d" : "EEE d"), received: 0, sent: 0 });
  }
  const dayIndex = new Map(days.map((d, i) => [d.date, i]));
  const byPlatform = new Map<PlatformId, { received: number; sent: number }>();
  const byAccount = new Map<string, { received: number; sent: number }>();
  const contactCounts = new Map<string, { messages: number; lastAt: string }>();
  const hourly = new Map<string, number>();
  const responseSamples: { platform: PlatformId; minutes: number }[] = [];
  let received = 0;
  let sent = 0;
  let earliest: string | null = null;

  for (const [convId, msgs] of Object.entries(input.messages)) {
    const conv = convById.get(convId);
    if (!conv) continue;
    let pendingInbound: Message | null = null;
    for (const m of msgs) {
      if (!earliest || m.sentAt < earliest) earliest = m.sentAt;
      const t = new Date(m.sentAt).getTime();
      const mine = m.authorId === "me";

      // Response time: first reply from me after an inbound message (1:1 + email only)
      if (conv.kind !== "channel") {
        if (!mine && !pendingInbound) pendingInbound = m;
        if (mine && pendingInbound) {
          const minutes = (t - new Date(pendingInbound.sentAt).getTime()) / 60_000;
          if (minutes >= 0 && t >= since) responseSamples.push({ platform: conv.platform, minutes });
          pendingInbound = null;
        }
      }

      if (t < since || t > now || m.status === "failed") continue;
      const key = format(new Date(t), "yyyy-MM-dd");
      const idx = dayIndex.get(key);
      if (idx !== undefined) {
        if (mine) days[idx].sent++;
        else days[idx].received++;
      }
      if (mine) sent++;
      else received++;

      const pp = byPlatform.get(conv.platform) ?? { received: 0, sent: 0 };
      const pa = byAccount.get(conv.accountId) ?? { received: 0, sent: 0 };
      if (mine) {
        pp.sent++;
        pa.sent++;
      } else {
        pp.received++;
        pa.received++;
      }
      byPlatform.set(conv.platform, pp);
      byAccount.set(conv.accountId, pa);

      const d = new Date(t);
      const hk = `${(d.getDay() + 6) % 7}:${d.getHours()}`;
      hourly.set(hk, (hourly.get(hk) ?? 0) + 1);

      const author = mine ? undefined : conv.participants.find((p) => p.id === m.authorId);
      const cid = author?.contactId ?? (mine ? conv.contactId : undefined);
      if (cid && contactById.has(cid)) {
        const cc = contactCounts.get(cid) ?? { messages: 0, lastAt: m.sentAt };
        cc.messages++;
        if (m.sentAt > cc.lastAt) cc.lastAt = m.sentAt;
        contactCounts.set(cid, cc);
      }
    }
  }

  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };

  const rtByPlatform = new Map<PlatformId, number[]>();
  for (const s of responseSamples) rtByPlatform.set(s.platform, [...(rtByPlatform.get(s.platform) ?? []), s.minutes]);

  const awaitingYou = input.conversations.filter((c) => !c.archived && c.lastAuthorId !== "me" && c.unreadCount > 0).length;

  return {
    rangeDays: input.rangeDays,
    totals: { received, sent, conversations: input.conversations.length, awaitingYou },
    daily: days,
    byPlatform: [...byPlatform.entries()].map(([platform, v]) => ({ platform, ...v })).sort((a, b) => b.received + b.sent - (a.received + a.sent)),
    byAccount: [...byAccount.entries()].map(([accountId, v]) => ({ accountId, ...v })).sort((a, b) => b.received + b.sent - (a.received + a.sent)),
    responseTime: {
      medianMinutes: median(responseSamples.map((s) => s.minutes)),
      samples: responseSamples.length,
      byPlatform: [...rtByPlatform.entries()].map(([platform, xs]) => ({ platform, medianMinutes: median(xs)!, samples: xs.length })),
    },
    topContacts: [...contactCounts.entries()]
      .map(([contactId, v]) => ({ contactId, name: contactById.get(contactId)!.name, ...v }))
      .sort((a, b) => b.messages - a.messages)
      .slice(0, 6),
    hourly: [...hourly.entries()].map(([k, count]) => {
      const [day, hour] = k.split(":").map(Number);
      return { day, hour, count };
    }),
    earliestMessageAt: earliest,
    coverageDays: earliest ? Math.ceil((now - new Date(earliest).getTime()) / 86_400_000) : 0,
  };
}

export function formatMinutes(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${Math.round(min)}m`;
  if (min < 60 * 24) return `${(min / 60).toFixed(min < 600 ? 1 : 0)}h`;
  return `${(min / (60 * 24)).toFixed(1)}d`;
}
