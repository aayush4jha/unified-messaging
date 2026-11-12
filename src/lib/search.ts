/**
 * Universal search.
 *
 * `parseQuery` turns free text ("find the WhatsApp conversation where someone
 * shared a PDF", "from:rahul after:2026-10-01 has:attachment") into structured
 * filters. Every interpretation becomes a visible chip, so users can see and
 * undo how their words were understood. `runSearch` then ranks
 * message-level matches and groups them by conversation.
 */
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { PLATFORMS } from "./platforms";
import type { Account, Contact, Conversation, ConversationKind, Message, PlatformId } from "./types";
import { escapeRegExp } from "./intelligence/signals";

export interface SearchFilters {
  platforms: PlatformId[];
  accountIds: string[];
  contactIds: string[];
  /** Contacts who must have authored the matching message ("from X"). */
  fromContactIds: string[];
  /** Free-form sender names that didn't resolve to a contact. */
  people: string[];
  after?: string;
  before?: string;
  hasAttachment?: boolean;
  attachmentKinds: ("pdf" | "image" | "doc")[];
  unread?: boolean;
  starred?: boolean;
  kinds: ConversationKind[];
  fromMe?: boolean;
}

export interface ParsedQuery {
  terms: string[];
  phrases: string[];
  filters: SearchFilters;
  chips: { key: string; label: string }[];
}

export const emptyFilters = (): SearchFilters => ({
  platforms: [],
  accountIds: [],
  contactIds: [],
  fromContactIds: [],
  people: [],
  attachmentKinds: [],
  kinds: [],
});

const STOPWORDS = new Set(
  `a an the i me my mine we our you your find show search get look for of to in on at by with from and or is are was were be been
  that this these those which who whom where when what all any some someone somebody something message messages conversation conversations
  chat chats thread threads email emails mail mails dm dms received sent got had has have did do does about containing contain contains mention mentioning mentioned
  particular person people shared share sharing please last week month year yesterday today ago between`.split(/\s+/),
);

const PLATFORM_ALIASES: Record<string, PlatformId> = {
  gmail: "gmail",
  google: "gmail",
  outlook: "outlook",
  slack: "slack",
  teams: "teams",
  telegram: "telegram",
  tg: "telegram",
  whatsapp: "whatsapp",
  wa: "whatsapp",
  discord: "discord",
  linkedin: "linkedin",
  instagram: "instagram",
  ig: "instagram",
  insta: "instagram",
  messenger: "messenger",
  facebook: "messenger",
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export interface SearchContext {
  contacts: Contact[];
  accounts: Account[];
  now?: Date;
}

export function parseQuery(raw: string, ctx: SearchContext): ParsedQuery {
  const now = ctx.now ?? new Date();
  const filters = emptyFilters();
  const chips: ParsedQuery["chips"] = [];
  const phrases: string[] = [];
  let q = ` ${raw.trim()} `;

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    let m: RegExpMatchArray | null;
    const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    while ((m = global.exec(q)) !== null) fn(m);
    q = q.replace(global, " ");
  };

  // Quoted phrases
  take(/"([^"]+)"|“([^”]+)”/, (m) => {
    const phrase = (m[1] ?? m[2]).trim();
    if (phrase) {
      phrases.push(phrase.toLowerCase());
      chips.push({ key: `phrase:${phrase}`, label: `“${phrase}”` });
    }
  });

  // Explicit operators
  const nlTerms: string[] = [];
  take(/\b(from|with|to):("[^"]+"|\S+)/i, (m) => resolvePerson(m[2].replace(/"/g, ""), true, m[1].toLowerCase() === "from"));
  take(/\b(in|platform|on):(\S+)/i, (m) => addPlatform(m[2].toLowerCase()));
  take(/\baccount:(\S+)/i, (m) => {
    const v = m[1].toLowerCase();
    const acc = ctx.accounts.find((a) => a.id === v || a.label.toLowerCase() === v || a.handle.toLowerCase().includes(v));
    if (acc) {
      filters.accountIds.push(acc.id);
      chips.push({ key: `account:${acc.id}`, label: `${PLATFORMS[acc.platform].shortName} · ${acc.label}` });
    }
  });
  take(/\bhas:(\S+)/i, (m) => addAttachment(m[1].toLowerCase()));
  take(/\bis:(unread|starred|sent)\b/i, (m) => {
    const v = m[1].toLowerCase();
    if (v === "unread") setUnread();
    if (v === "starred") {
      filters.starred = true;
      chips.push({ key: "starred", label: "Starred" });
    }
    if (v === "sent") setFromMe();
  });
  take(/\b(after|since):(\d{4}-\d{2}-\d{2})/i, (m) => setRange(startOfDay(new Date(m[2])), undefined, `After ${m[2]}`));
  take(/\bbefore:(\d{4}-\d{2}-\d{2})/i, (m) => setRange(undefined, endOfDay(new Date(m[1])), `Before ${m[1]}`));
  take(/\btype:(email|dm|chat|group|channel)\b/i, (m) => addKind(m[1].toLowerCase()));

  // Natural-language dates
  take(/\blast week\b/i, () => {
    const s = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    setRange(s, endOfWeek(s, { weekStartsOn: 1 }), "Last week");
  });
  take(/\bthis week\b/i, () => setRange(startOfWeek(now, { weekStartsOn: 1 }), undefined, "This week"));
  take(/\blast month\b/i, () => {
    const s = startOfMonth(subMonths(now, 1));
    setRange(s, endOfMonth(s), "Last month");
  });
  take(/\byesterday\b/i, () => {
    const y = subDays(now, 1);
    setRange(startOfDay(y), endOfDay(y), "Yesterday");
  });
  take(/\btoday\b/i, () => setRange(startOfDay(now), undefined, "Today"));
  take(/\b(?:past|last) (\d{1,2}) days\b/i, (m) => setRange(startOfDay(subDays(now, Number(m[1]))), undefined, `Past ${m[1]} days`));
  take(new RegExp(`\\b(?:in|from|during)?\\s*(${MONTHS.join("|")})\\b`, "i"), (m) => {
    const month = MONTHS.indexOf(m[1].toLowerCase());
    let year = now.getFullYear();
    if (month > now.getMonth()) year -= 1;
    const s = new Date(year, month, 1);
    setRange(s, endOfMonth(s), `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${year}`);
  });

  // Attachments & kinds in natural language
  take(/\b(pdfs?|documents?|docs?|photos?|images?|pictures?|attachments?|files?)\b/i, (m) => addAttachment(m[1].toLowerCase()));
  take(/\bunread\b/i, () => setUnread());
  take(/\bstarred\b/i, () => {
    filters.starred = true;
    chips.push({ key: "starred", label: "Starred" });
  });
  take(/\b(?:i sent|sent by me|my replies)\b/i, () => setFromMe());

  // "from Rahul", "with Priya", "by Daniel"
  take(/\b(from|with|by)\s+([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)?)/iu, (m) => {
    const first = m[2].split(/\s+/)[0].toLowerCase();
    // Lowercase words after "from" only count when they're a known contact ("from rahul")
    if (m[2][0] !== m[2][0].toUpperCase() && !matchContact(first)) return;
    resolvePerson(m[2], false, m[1].toLowerCase() !== "with");
  });

  // Platform names in free text
  const words = q.split(/\s+/).filter(Boolean);
  const remaining: string[] = [];
  for (const w of words) {
    const lw = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (PLATFORM_ALIASES[lw]) {
      addPlatform(lw);
      continue;
    }
    if (lw === "email" || lw === "emails") {
      addKind("email");
      continue;
    }
    // Bare contact first names ("Rahul") resolve to people even without "from"
    const contact = matchContact(lw);
    if (contact && lw.length > 2 && !STOPWORDS.has(lw)) {
      addContact(contact);
      continue;
    }
    if (lw && !STOPWORDS.has(lw)) remaining.push(lw);
  }

  return { terms: dedupe([...nlTerms, ...remaining]), phrases, filters, chips: dedupeChips(chips) };

  function matchContact(name: string): Contact | undefined {
    const n = name.toLowerCase();
    if (n.length < 2) return undefined;
    return ctx.contacts.find((c) => c.name.toLowerCase().split(/\s+/).some((part) => part.replace(/[^\p{L}]/gu, "") === n) || c.name.toLowerCase() === n);
  }

  function addContact(c: Contact, from = false) {
    if (!filters.contactIds.includes(c.id)) filters.contactIds.push(c.id);
    if (from && !filters.fromContactIds.includes(c.id)) filters.fromContactIds.push(c.id);
    chips.push({ key: `contact:${c.id}`, label: from ? `From: ${c.name}` : `Person: ${c.name}` });
  }

  function resolvePerson(name: string, explicit: boolean, from = false) {
    const first = name.trim().split(/\s+/)[0];
    const c = matchContact(first) ?? ctx.contacts.find((x) => x.name.toLowerCase().includes(name.toLowerCase()));
    if (c) addContact(c, from);
    else if (explicit && name.trim()) {
      filters.people.push(name.toLowerCase());
      chips.push({ key: `person:${name}`, label: `Person: ${name}` });
    } else {
      // Not a known person (e.g. "with Lumen Labs"): search it as text instead.
      nlTerms.push(...name.toLowerCase().split(/\s+/).filter((w) => w && !STOPWORDS.has(w)));
    }
  }

  function addPlatform(alias: string) {
    const id = PLATFORM_ALIASES[alias] ?? (alias in PLATFORMS ? (alias as PlatformId) : undefined);
    if (!id || filters.platforms.includes(id)) return;
    filters.platforms.push(id);
    chips.push({ key: `platform:${id}`, label: PLATFORMS[id].name });
  }

  function addAttachment(word: string) {
    filters.hasAttachment = true;
    if (/pdf/.test(word)) {
      filters.attachmentKinds.push("pdf");
      chips.push({ key: "att:pdf", label: "Has PDF" });
    } else if (/photo|image|picture/.test(word)) {
      filters.attachmentKinds.push("image");
      chips.push({ key: "att:image", label: "Has image" });
    } else if (/doc/.test(word)) {
      filters.attachmentKinds.push("doc");
      chips.push({ key: "att:doc", label: "Has document" });
    } else chips.push({ key: "att:any", label: "Has attachment" });
  }

  function addKind(kind: string) {
    const k: ConversationKind = kind === "chat" ? "dm" : (kind as ConversationKind);
    if (!filters.kinds.includes(k)) filters.kinds.push(k);
    chips.push({ key: `kind:${k}`, label: k === "email" ? "Emails" : k === "channel" ? "Channels" : k === "group" ? "Groups" : "Direct messages" });
  }

  function setUnread() {
    filters.unread = true;
    chips.push({ key: "unread", label: "Unread" });
  }

  function setFromMe() {
    filters.fromMe = true;
    chips.push({ key: "fromMe", label: "Sent by you" });
  }

  function setRange(after: Date | undefined, before: Date | undefined, label: string) {
    if (after) filters.after = after.toISOString();
    if (before) filters.before = before.toISOString();
    chips.push({ key: "date", label });
  }
}

export interface SearchHit {
  conversation: Conversation;
  message?: Message;
  score: number;
  snippet: string;
  matchedTerms: string[];
}

export function runSearch(
  parsed: ParsedQuery,
  data: { conversations: Conversation[]; messages: Record<string, Message[]>; contacts: Contact[] },
  limit = 50,
): SearchHit[] {
  const { filters, terms, phrases } = parsed;
  const contactById = new Map(data.contacts.map((c) => [c.id, c]));
  const needles = [...phrases, ...terms];
  const hits: SearchHit[] = [];

  for (const conv of data.conversations) {
    if (filters.platforms.length && !filters.platforms.includes(conv.platform)) continue;
    if (filters.accountIds.length && !filters.accountIds.includes(conv.accountId)) continue;
    if (filters.kinds.length && !filters.kinds.includes(conv.kind)) continue;
    if (filters.unread && conv.unreadCount === 0) continue;
    if (filters.starred && !conv.starred) continue;
    if (filters.contactIds.length) {
      const linked = new Set<string>();
      for (const id of filters.contactIds) {
        linked.add(id);
        contactById.get(id)?.mergedFrom.forEach((m) => linked.add(m.id));
      }
      const involves = conv.participants.some((p) => p.contactId && linked.has(p.contactId)) || (conv.contactId && linked.has(conv.contactId));
      if (!involves) continue;
    }
    if (filters.people.length) {
      const names = conv.participants.map((p) => `${p.name} ${p.handle ?? ""}`.toLowerCase()).join(" ");
      if (!filters.people.every((n) => names.includes(n))) continue;
    }

    const msgs = data.messages[conv.id] ?? [];
    const convText = `${conv.title} ${conv.participants.map((p) => `${p.name} ${p.handle ?? ""}`).join(" ")}`.toLowerCase();
    let best: SearchHit | null = null;

    for (const m of msgs) {
      if (filters.after && m.sentAt < filters.after) continue;
      if (filters.before && m.sentAt > filters.before) continue;
      if (filters.fromMe && m.authorId !== "me") continue;
      if (filters.fromContactIds.length) {
        const author = conv.participants.find((p) => p.id === m.authorId);
        const ids = new Set(filters.fromContactIds.flatMap((id) => [id, ...(contactById.get(id)?.mergedFrom.map((x) => x.id) ?? [])]));
        if (!author?.contactId || !ids.has(author.contactId)) continue;
      }
      if (filters.hasAttachment) {
        if (m.attachments.length === 0) continue;
        if (filters.attachmentKinds.length && !m.attachments.some((a) => filters.attachmentKinds.some((k) => attachmentIs(a.mimeType, a.name, k)))) continue;
      }

      const body = `${m.subject ?? ""} ${m.body} ${m.attachments.map((a) => a.name).join(" ")}`.toLowerCase();
      let score = 0;
      const matched: string[] = [];
      let allMatched = true;
      for (const n of needles) {
        const inBody = body.includes(n);
        const inConv = convText.includes(n);
        if (inBody) score += phrases.includes(n) ? 6 : 3;
        else if (inConv) score += 2;
        else {
          // Prefix / fuzzy-ish match on word starts ("intern" → "internship")
          const re = new RegExp(`\\b${escapeRegExp(n.slice(0, Math.max(3, n.length - 2)))}`, "i");
          if (n.length > 3 && (re.test(body) || re.test(convText))) score += 1;
          else allMatched = false;
        }
        if (inBody || inConv) matched.push(n);
      }
      if (needles.length && !allMatched) continue;
      if (!needles.length) score = 1;
      // Recency boost
      const ageDays = (Date.now() - new Date(m.sentAt).getTime()) / 86_400_000;
      score += Math.max(0, 1.5 - ageDays / 30);

      if (!best || score > best.score) {
        best = { conversation: conv, message: m, score, snippet: makeSnippet(m.body, needles), matchedTerms: matched };
      }
    }
    if (best) hits.push(best);
  }

  return hits.sort((a, b) => b.score - a.score || b.conversation.lastMessageAt.localeCompare(a.conversation.lastMessageAt)).slice(0, limit);
}

function attachmentIs(mime: string, name: string, kind: "pdf" | "image" | "doc"): boolean {
  if (kind === "pdf") return mime === "application/pdf" || name.toLowerCase().endsWith(".pdf");
  if (kind === "image") return mime.startsWith("image/");
  return /word|document|text|sheet|presentation/.test(mime) || /\.(docx?|txt|md|pages)$/i.test(name);
}

export function makeSnippet(body: string, needles: string[], radius = 70): string {
  const flat = body.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  let idx = -1;
  for (const n of needles) {
    idx = lower.indexOf(n);
    if (idx >= 0) break;
  }
  if (idx < 0) return flat.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(flat.length, idx + radius);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

export function highlightParts(text: string, needles: string[]): { text: string; match: boolean }[] {
  const clean = needles.filter((n) => n.length > 1);
  if (!clean.length) return [{ text, match: false }];
  const re = new RegExp(`(${clean.map(escapeRegExp).join("|")})`, "gi");
  return text
    .split(re)
    .filter(Boolean)
    .map((part) => ({ text: part, match: clean.some((n) => n.toLowerCase() === part.toLowerCase()) }));
}

function dedupe<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function dedupeChips(chips: ParsedQuery["chips"]) {
  const seen = new Set<string>();
  return chips.filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)));
}
