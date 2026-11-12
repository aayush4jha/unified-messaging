"use client";

import { format, startOfDay, subDays } from "date-fns";
import { ChevronDown, Menu as MenuIcon, Paperclip, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { PLATFORMS } from "@/lib/platforms";
import { inboxHref } from "@/lib/routes";
import { highlightParts, parseQuery, runSearch, type SearchFilters } from "@/lib/search";
import type { ConversationKind, PlatformId } from "@/lib/types";
import { cn, formatMessageTime } from "@/lib/utils";
import { useNow } from "@/store/selectors";
import { useUI } from "@/store/ui";
import { useWorkspace } from "@/store/workspace";
import { PlatformIcon } from "../brand/platform-icon";
import { Avatar } from "../ui/avatar";
import { IconButton } from "../ui/button";
import { EmptyState } from "../ui/empty";
import { Menu, MenuCheckboxItem, MenuContent, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from "../ui/menu";

type DateRange = "any" | "today" | "7d" | "30d" | "90d";
type ReadFilter = "any" | "unread" | "read";

const EXAMPLES = [
  "Find the email I received from Rahul last week",
  "WhatsApp conversation where someone shared a PDF",
  "“internship opportunity”",
  "LinkedIn conversation from October",
  "messages mentioning Halcyon",
];

export function SearchView() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") ?? "");
  const deferred = useDeferredValue(q);
  const conversations = useWorkspace((s) => s.conversations);
  const messages = useWorkspace((s) => s.messages);
  const contacts = useWorkspace((s) => s.contacts);
  const accounts = useWorkspace((s) => s.accounts);
  const setMobileNav = useUI((s) => s.setMobileNav);
  const now = useNow();

  const [platforms, setPlatforms] = useState<PlatformId[]>([]);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [contactId, setContactId] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>("any");
  const [attachments, setAttachments] = useState(false);
  const [read, setRead] = useState<ReadFilter>("any");
  const [kinds, setKinds] = useState<ConversationKind[]>([]);

  const parsed = useMemo(() => parseQuery(deferred, { contacts, accounts }), [deferred, contacts, accounts]);

  const merged = useMemo(() => {
    const f: SearchFilters = {
      ...parsed.filters,
      platforms: Array.from(new Set([...parsed.filters.platforms, ...platforms])),
      accountIds: Array.from(new Set([...parsed.filters.accountIds, ...accountIds])),
      contactIds: Array.from(new Set([...parsed.filters.contactIds, ...(contactId ? [contactId] : [])])),
      kinds: Array.from(new Set([...parsed.filters.kinds, ...kinds])),
      hasAttachment: parsed.filters.hasAttachment || attachments || undefined,
      unread: parsed.filters.unread || read === "unread" || undefined,
    };
    if (range !== "any") {
      const days = { today: 0, "7d": 7, "30d": 30, "90d": 90 }[range];
      f.after = startOfDay(subDays(new Date(now), days)).toISOString();
    }
    return { ...parsed, filters: f };
  }, [parsed, platforms, accountIds, contactId, kinds, attachments, read, range, now]);

  const anyFilter = platforms.length || accountIds.length || contactId || range !== "any" || attachments || read !== "any" || kinds.length;
  const active = deferred.trim() || anyFilter;

  const hits = useMemo(() => {
    if (!active) return [];
    let r = runSearch(merged, { conversations, messages, contacts }, 100);
    if (read === "read") r = r.filter((h) => h.conversation.unreadCount === 0);
    return r;
  }, [active, merged, conversations, messages, contacts, read]);
  const needles = [...parsed.phrases, ...parsed.terms];

  const clearAll = () => {
    setPlatforms([]);
    setAccountIds([]);
    setContactId(null);
    setRange("any");
    setAttachments(false);
    setRead("any");
    setKinds([]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="shrink-0 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[880px] items-center gap-2 px-4 pt-4 sm:px-6">
          <IconButton label="Open navigation" className="-ml-1.5 md:hidden" onClick={() => setMobileNav(true)}>
            <MenuIcon />
          </IconButton>
          <div className="flex h-11 flex-1 items-center gap-2.5 rounded-lg border border-line bg-surface px-3 shadow-xs focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-soft">
            <Search className="size-4 shrink-0 text-fg-3" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                router.replace(`/search?q=${encodeURIComponent(e.target.value)}`, { scroll: false });
              }}
              autoFocus
              placeholder="Search every conversation, in plain language or with from:, in:, has:, before:…"
              aria-label="Search"
              className="h-full flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-fg-4"
            />
            {q ? (
              <IconButton size="xs" label="Clear search" onClick={() => setQ("")}>
                <X />
              </IconButton>
            ) : null}
          </div>
        </div>

        {/* Filters */}
        <div className="mx-auto flex max-w-[880px] flex-wrap items-center gap-1.5 px-4 pb-3 pt-3 sm:px-6">
          <FilterMenu label="Platform" active={platforms.length > 0} value={platforms.map((p) => PLATFORMS[p].shortName).join(", ")}>
            <MenuLabel>Platforms</MenuLabel>
            {Array.from(new Set(accounts.map((a) => a.platform))).map((p) => (
              <MenuCheckboxItem key={p} checked={platforms.includes(p)} onCheckedChange={(v) => setPlatforms((xs) => (v ? [...xs, p] : xs.filter((x) => x !== p)))} onSelect={(e) => e.preventDefault()}>
                <PlatformIcon platform={p} size={14} /> {PLATFORMS[p].name}
              </MenuCheckboxItem>
            ))}
          </FilterMenu>
          <FilterMenu label="Account" active={accountIds.length > 0} value={accountIds.map((id) => accounts.find((a) => a.id === id)?.label).join(", ")}>
            <MenuLabel>Accounts</MenuLabel>
            {accounts.map((a) => (
              <MenuCheckboxItem key={a.id} checked={accountIds.includes(a.id)} onCheckedChange={(v) => setAccountIds((xs) => (v ? [...xs, a.id] : xs.filter((x) => x !== a.id)))} onSelect={(e) => e.preventDefault()}>
                <PlatformIcon platform={a.platform} size={14} /> {PLATFORMS[a.platform].shortName} · {a.label}
              </MenuCheckboxItem>
            ))}
          </FilterMenu>
          <FilterMenu label="Person" active={!!contactId} value={contacts.find((c) => c.id === contactId)?.name}>
            <MenuRadioGroup value={contactId ?? ""} onValueChange={(v) => setContactId(v || null)}>
              <MenuRadioItem value="">Anyone</MenuRadioItem>
              <MenuSeparator />
              {[...contacts].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                <MenuRadioItem key={c.id} value={c.id}>
                  <Avatar name={c.name} hue={c.avatarHue} size="xs" /> {c.name}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </FilterMenu>
          <FilterMenu label="Date" active={range !== "any"} value={{ any: "", today: "Today", "7d": "Past 7 days", "30d": "Past 30 days", "90d": "Past 90 days" }[range]}>
            <MenuRadioGroup value={range} onValueChange={(v) => setRange(v as DateRange)}>
              <MenuRadioItem value="any">Any time</MenuRadioItem>
              <MenuRadioItem value="today">Today</MenuRadioItem>
              <MenuRadioItem value="7d">Past 7 days</MenuRadioItem>
              <MenuRadioItem value="30d">Past 30 days</MenuRadioItem>
              <MenuRadioItem value="90d">Past 90 days</MenuRadioItem>
            </MenuRadioGroup>
          </FilterMenu>
          <FilterMenu label="Type" active={kinds.length > 0} value={kinds.map((k) => ({ email: "Email", dm: "DM", group: "Group", channel: "Channel" })[k]).join(", ")}>
            {(["email", "dm", "group", "channel"] as ConversationKind[]).map((k) => (
              <MenuCheckboxItem key={k} checked={kinds.includes(k)} onCheckedChange={(v) => setKinds((xs) => (v ? [...xs, k] : xs.filter((x) => x !== k)))} onSelect={(e) => e.preventDefault()}>
                {{ email: "Emails", dm: "Direct messages", group: "Group chats", channel: "Channels" }[k]}
              </MenuCheckboxItem>
            ))}
          </FilterMenu>
          <FilterMenu label="Status" active={read !== "any"} value={read === "unread" ? "Unread" : read === "read" ? "Read" : ""}>
            <MenuRadioGroup value={read} onValueChange={(v) => setRead(v as ReadFilter)}>
              <MenuRadioItem value="any">Read or unread</MenuRadioItem>
              <MenuRadioItem value="unread">Unread only</MenuRadioItem>
              <MenuRadioItem value="read">Read only</MenuRadioItem>
            </MenuRadioGroup>
          </FilterMenu>
          <button
            onClick={() => setAttachments((v) => !v)}
            aria-pressed={attachments}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
              attachments ? "border-accent bg-accent-soft text-accent-text" : "border-line text-fg-2 hover:border-line-strong",
            )}
          >
            <Paperclip className="size-3" /> Has attachment
          </button>
          {anyFilter ? (
            <button onClick={clearAll} className="ml-1 text-xs font-medium text-fg-3 hover:text-fg">
              Clear filters
            </button>
          ) : null}
        </div>

        {parsed.chips.length > 0 ? (
          <div className="mx-auto flex max-w-[880px] flex-wrap items-center gap-1.5 px-4 pb-3 text-xs sm:px-6">
            <span className="text-fg-4">Understood your search as</span>
            {parsed.chips.map((c) => (
              <span key={c.key} className="inline-flex h-5 items-center rounded-[4px] bg-accent-soft px-1.5 font-medium text-accent-text">
                {c.label}
              </span>
            ))}
            {parsed.terms.length ? <span className="text-fg-3">containing “{parsed.terms.join(" ")}”</span> : null}
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-[880px] px-4 py-4 sm:px-6">
          {!active ? (
            <div className="py-8">
              <p className="text-[0.8125rem] font-medium text-fg-2">Try asking naturally</p>
              <div className="mt-3 flex flex-col items-start gap-1.5">
                {EXAMPLES.map((e) => (
                  <button key={e} onClick={() => setQ(e)} className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.8125rem] text-fg-3 hover:bg-hover hover:text-fg">
                    <Search className="size-3.5" /> {e}
                  </button>
                ))}
              </div>
              <div className="mt-8 rounded-lg border border-line bg-surface p-4 text-xs leading-5 text-fg-3">
                <p className="mb-1.5 font-medium text-fg-2">Operators</p>
                <code className="font-mono text-fg-2">from:rahul</code> · <code className="font-mono text-fg-2">in:slack</code> · <code className="font-mono text-fg-2">account:work</code> ·{" "}
                <code className="font-mono text-fg-2">has:pdf</code> · <code className="font-mono text-fg-2">is:unread</code> · <code className="font-mono text-fg-2">after:2026-10-01</code> ·{" "}
                <code className="font-mono text-fg-2">type:channel</code> · <code className="font-mono text-fg-2">&quot;exact phrase&quot;</code>
              </div>
            </div>
          ) : hits.length === 0 ? (
            <EmptyState
              icon={<Search />}
              title="No conversations match"
              description="Try fewer words, a different person or platform, or clear the filters."
              action={anyFilter ? <button className="text-[0.8125rem] font-medium text-accent-text hover:underline" onClick={clearAll}>Clear filters</button> : undefined}
            />
          ) : (
            <>
              <p className="mb-3 text-xs text-fg-3">
                {hits.length} conversation{hits.length === 1 ? "" : "s"}
              </p>
              <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
                {hits.map((h) => {
                  const account = accounts.find((a) => a.id === h.conversation.accountId);
                  const author = h.message?.authorId === "me" ? "You" : h.conversation.participants.find((p) => p.id === h.message?.authorId)?.name;
                  return (
                    <Link key={h.conversation.id} href={inboxHref({ c: h.conversation.id })} className="flex gap-3 border-b border-line-subtle px-4 py-3 last:border-b-0 hover:bg-hover">
                      <PlatformIcon platform={h.conversation.platform} size={20} className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="truncate text-[0.8125rem] font-semibold">
                            {h.conversation.kind === "channel" ? `#${h.conversation.title}` : h.conversation.title}
                          </span>
                          <span className="shrink-0 text-xs text-fg-3">
                            {PLATFORMS[h.conversation.platform].shortName} · {account?.label}
                          </span>
                          <span className="ml-auto shrink-0 text-[0.6875rem] text-fg-4">{h.message ? formatMessageTime(h.message.sentAt) : ""}</span>
                        </div>
                        <p className="mt-1 text-[0.8125rem] leading-5 text-fg-2">
                          {author ? <span className="font-medium text-fg">{author}: </span> : null}
                          {highlightParts(h.snippet, needles).map((p, i) =>
                            p.match ? (
                              <mark key={i} className="rounded-[2px] bg-warning-soft px-0.5 text-fg">
                                {p.text}
                              </mark>
                            ) : (
                              <span key={i}>{p.text}</span>
                            ),
                          )}
                        </p>
                        {h.message?.attachments.length ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {h.message.attachments.map((a) => (
                              <span key={a.id} className="inline-flex h-5 items-center gap-1 rounded-[4px] bg-hover px-1.5 text-[0.6875rem] text-fg-2">
                                <Paperclip className="size-3" /> {a.name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
              <p className="mt-4 text-center text-[0.6875rem] text-fg-4">Searching {Object.values(messages).reduce((n, m) => n + m.length, 0)} synced messages as of {format(new Date(now), "h:mm a")}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterMenu({ label, active, value, children }: { label: string; active: boolean; value?: string; children: React.ReactNode }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          className={cn(
            "inline-flex h-7 max-w-[220px] items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors",
            active ? "border-accent bg-accent-soft text-accent-text" : "border-line text-fg-2 hover:border-line-strong",
          )}
        >
          <span className="truncate">{active && value ? `${label}: ${value}` : label}</span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </button>
      </MenuTrigger>
      <MenuContent className="max-h-[320px] w-60 overflow-y-auto scrollbar-thin">{children}</MenuContent>
    </Menu>
  );
}
