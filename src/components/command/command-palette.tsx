"use client";

import { Command } from "cmdk";
import {
  Archive,
  ArrowRight,
  BarChart3,
  Bell,
  Clock,
  FileText,
  Inbox,
  Keyboard,
  ListChecks,
  MailOpen,
  Monitor,
  Moon,
  PenSquare,
  Search,
  Send,
  Settings,
  Sparkles,
  Star,
  Sun,
  Users,
  Zap,
} from "lucide-react";
import { Dialog as D } from "radix-ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo } from "react";
import { PLATFORMS } from "@/lib/platforms";
import { inboxHref } from "@/lib/routes";
import { highlightParts, parseQuery, runSearch } from "@/lib/search";
import { formatListTime, modKey } from "@/lib/utils";
import { useUI } from "@/store/ui";
import { useWorkspace } from "@/store/workspace";
import { PlatformIcon } from "../brand/platform-icon";
import { Avatar } from "../ui/avatar";
import { Kbd } from "../ui/kbd";

interface Action {
  id: string;
  label: string;
  icon: React.ReactNode;
  keywords?: string;
  shortcut?: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen);
  const setPalette = useUI((s) => s.setPalette);
  return (
    <D.Root open={open} onOpenChange={(o) => setPalette(o)}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[65] bg-overlay data-[state=open]:animate-fade-in" />
        <D.Content
          className="fixed left-1/2 top-[10vh] z-[66] w-[calc(100vw-1.5rem)] max-w-[680px] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface-raised shadow-xl outline-none data-[state=open]:animate-scale-in"
          aria-label="Command palette"
        >
          <D.Title className="sr-only">Search and commands</D.Title>
          <D.Description className="sr-only">Search messages and people, jump anywhere, or run an action.</D.Description>
          {open ? <Palette /> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function Palette() {
  const router = useRouter();
  const params = useSearchParams();
  const query = useUI((s) => s.paletteQuery);
  const { setPalette, openCompose, setShortcuts, setNotifications } = useUI.getState();
  const deferred = useDeferredValue(query);
  const conversations = useWorkspace((s) => s.conversations);
  const messages = useWorkspace((s) => s.messages);
  const contacts = useWorkspace((s) => s.contacts);
  const accounts = useWorkspace((s) => s.accounts);
  const setPrefs = useWorkspace((s) => s.setPrefs);
  const openConversationId = params.get("c");

  const close = () => setPalette(false);
  const go = (href: string) => {
    close();
    router.push(href);
  };

  const parsed = useMemo(() => (deferred.trim() ? parseQuery(deferred, { contacts, accounts }) : null), [deferred, contacts, accounts]);
  const hits = useMemo(() => (parsed ? runSearch(parsed, { conversations, messages, contacts }, 7) : []), [parsed, conversations, messages, contacts]);
  const needles = parsed ? [...parsed.phrases, ...parsed.terms] : [];

  const people = useMemo(() => {
    const q = deferred.trim().toLowerCase();
    if (!q) return [];
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q) || c.emails.some((e) => e.includes(q))).slice(0, 4);
  }, [deferred, contacts]);

  const actions: Action[] = [
    { id: "compose", label: "Compose new message", icon: <PenSquare />, shortcut: "C", keywords: "new write email send", run: () => (close(), openCompose()) },
    { id: "inbox", label: "Go to All Inbox", icon: <Inbox />, shortcut: "G I", run: () => go(inboxHref()) },
    { id: "unread", label: "Go to Unread", icon: <MailOpen />, shortcut: "G U", run: () => go(inboxHref({ folder: "unread" })) },
    { id: "starred", label: "Go to Starred", icon: <Star />, shortcut: "G S", run: () => go(inboxHref({ folder: "starred" })) },
    { id: "important", label: "Go to Important", icon: <Zap />, run: () => go(inboxHref({ folder: "important" })) },
    { id: "drafts", label: "Go to Drafts", icon: <FileText />, shortcut: "G D", run: () => go(inboxHref({ folder: "drafts" })) },
    { id: "scheduled", label: "Go to Scheduled", icon: <Clock />, run: () => go(inboxHref({ folder: "scheduled" })) },
    { id: "archived", label: "Go to Archived", icon: <Archive />, shortcut: "G E", run: () => go(inboxHref({ folder: "archived" })) },
    { id: "sent", label: "Go to Sent", icon: <Send />, shortcut: "G T", run: () => go(inboxHref({ folder: "sent" })) },
    { id: "assistant", label: "Ask the assistant", icon: <Sparkles />, shortcut: "G A", keywords: "ai briefing summary", run: () => go("/assistant") },
    { id: "followups", label: "Open follow-ups", icon: <ListChecks />, shortcut: "G F", keywords: "reminders tasks", run: () => go("/follow-ups") },
    { id: "contacts", label: "Open contacts", icon: <Users />, shortcut: "G C", run: () => go("/contacts") },
    { id: "analytics", label: "Open analytics", icon: <BarChart3 />, run: () => go("/analytics") },
    { id: "notifications", label: "Show notifications", icon: <Bell />, shortcut: "G N", run: () => (close(), setNotifications(true)) },
    { id: "settings", label: "Open settings", icon: <Settings />, shortcut: `${modKey()} ,`, run: () => go("/settings") },
    { id: "accounts", label: "Connect an account", icon: <ArrowRight />, keywords: "add gmail slack telegram integration", run: () => go("/settings?tab=accounts&connect=1") },
    { id: "light", label: "Switch to light theme", icon: <Sun />, keywords: "appearance", run: () => (setPrefs({ theme: "light" }), close()) },
    { id: "dark", label: "Switch to dark theme", icon: <Moon />, keywords: "appearance", run: () => (setPrefs({ theme: "dark" }), close()) },
    { id: "system", label: "Use system theme", icon: <Monitor />, keywords: "appearance", run: () => (setPrefs({ theme: "system" }), close()) },
    { id: "shortcuts", label: "Keyboard shortcuts", icon: <Keyboard />, shortcut: "?", run: () => (close(), setShortcuts(true)) },
  ];

  const q = query.trim().toLowerCase();
  const matchedActions = q ? actions.filter((a) => `${a.label} ${a.keywords ?? ""}`.toLowerCase().includes(q)).slice(0, 6) : actions.slice(0, 6);
  const matchedAccounts = q ? accounts.filter((a) => `${PLATFORMS[a.platform].name} ${a.label} ${a.handle}`.toLowerCase().includes(q)).slice(0, 4) : [];
  const recent = !q ? [...conversations].filter((c) => !c.archived).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)).slice(0, 5) : [];
  const current = openConversationId ? conversations.find((c) => c.id === openConversationId) : undefined;

  return (
    <Command shouldFilter={false} loop label="Command palette" className="flex max-h-[min(560px,75vh)] flex-col">
      <div className="flex items-center gap-3 border-b border-line-subtle px-4">
        <Search className="size-4 shrink-0 text-fg-3" />
        <Command.Input
          value={query}
          onValueChange={(v) => useUI.setState({ paletteQuery: v })}
          autoFocus
          placeholder="Search messages, people, or type a command…"
          className="h-[52px] w-full bg-transparent text-[0.9375rem] outline-none placeholder:text-fg-4"
        />
        <Kbd>Esc</Kbd>
      </div>

      {parsed && parsed.chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line-subtle px-4 py-2 text-xs">
          <span className="text-fg-4">Understood as</span>
          {parsed.chips.map((c) => (
            <span key={c.key} className="inline-flex h-5 items-center rounded-[4px] bg-accent-soft px-1.5 font-medium text-accent-text">
              {c.label}
            </span>
          ))}
          {parsed.terms.length ? <span className="text-fg-3">+ “{parsed.terms.join(" ")}”</span> : null}
        </div>
      ) : null}

      <Command.List className="min-h-0 flex-1 overflow-y-auto p-1.5 scrollbar-thin [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-[0.6875rem] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.05em] [&_[cmdk-group-heading]]:text-fg-4">
        <Command.Empty className="px-4 py-10 text-center text-[0.8125rem] text-fg-3">
          No matches. Try a person&apos;s name, a platform (“whatsapp”), or a phrase in quotes.
        </Command.Empty>

        {current && !q ? (
          <Command.Group heading="This conversation">
            <Item onSelect={() => (useWorkspace.getState().setArchived([current.id], !current.archived), close())} icon={<Archive />} shortcut="E">
              {current.archived ? "Move to inbox" : "Archive"}
            </Item>
            <Item onSelect={() => (useWorkspace.getState().toggleStar(current.id), close())} icon={<Star />} shortcut="S">
              {current.starred ? "Unstar" : "Star"}
            </Item>
            <Item onSelect={() => (useUI.getState().focusComposer(), close())} icon={<PenSquare />} shortcut="R">
              Reply
            </Item>
          </Command.Group>
        ) : null}

        {hits.length > 0 ? (
          <Command.Group heading="Messages">
            {hits.map((h) => (
              <Command.Item
                key={h.conversation.id}
                value={`msg-${h.conversation.id}`}
                onSelect={() => go(inboxHref({ c: h.conversation.id }))}
                className="flex cursor-default items-start gap-3 rounded-md px-2.5 py-2 data-[selected=true]:bg-hover"
              >
                <PlatformIcon platform={h.conversation.platform} size={18} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[0.8125rem] font-medium">
                      {h.conversation.kind === "channel" ? `#${h.conversation.title}` : h.conversation.kind === "email" ? h.conversation.title : h.conversation.title}
                    </span>
                    <span className="shrink-0 text-xs text-fg-4">{accounts.find((a) => a.id === h.conversation.accountId)?.label}</span>
                    <span className="ml-auto shrink-0 text-[0.6875rem] text-fg-4">{h.message ? formatListTime(h.message.sentAt) : ""}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-[1.125rem] text-fg-3">
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
                    <p className="mt-1 truncate text-[0.6875rem] text-fg-3">📎 {h.message.attachments.map((a) => a.name).join(", ")}</p>
                  ) : null}
                </div>
              </Command.Item>
            ))}
            <Item onSelect={() => go(`/search?q=${encodeURIComponent(query)}`)} icon={<Search />} shortcut="↵">
              See all results for “{query.trim()}”
            </Item>
          </Command.Group>
        ) : q ? (
          <Command.Group heading="Messages">
            <Item onSelect={() => go(`/search?q=${encodeURIComponent(query)}`)} icon={<Search />}>
              Search all messages for “{query.trim()}”
            </Item>
          </Command.Group>
        ) : null}

        {people.length > 0 ? (
          <Command.Group heading="People">
            {people.map((c) => (
              <Command.Item key={c.id} value={`person-${c.id}`} onSelect={() => go(`/contacts?id=${c.id}`)} className="flex cursor-default items-center gap-3 rounded-md px-2.5 py-2 data-[selected=true]:bg-hover">
                <Avatar name={c.name} hue={c.avatarHue} size="sm" />
                <span className="text-[0.8125rem] font-medium">{c.name}</span>
                <span className="truncate text-xs text-fg-3">{[c.title, c.company].filter(Boolean).join(" · ")}</span>
                <span className="ml-auto flex shrink-0 gap-1">
                  {Array.from(new Set(c.handles.map((h) => h.platform))).map((p) => (
                    <PlatformIcon key={p} platform={p} size={14} />
                  ))}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}

        {recent.length > 0 ? (
          <Command.Group heading="Recent">
            {recent.map((c) => (
              <Command.Item key={c.id} value={`recent-${c.id}`} onSelect={() => go(inboxHref({ c: c.id }))} className="flex cursor-default items-center gap-3 rounded-md px-2.5 py-2 data-[selected=true]:bg-hover">
                <PlatformIcon platform={c.platform} size={16} />
                <span className="truncate text-[0.8125rem]">{c.kind === "channel" ? `#${c.title}` : c.kind === "email" ? `${c.participants[0]?.name} — ${c.title}` : c.title}</span>
                <span className="ml-auto shrink-0 text-[0.6875rem] text-fg-4">{formatListTime(c.lastMessageAt)}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}

        {matchedAccounts.length > 0 ? (
          <Command.Group heading="Accounts">
            {matchedAccounts.map((a) => (
              <Item key={a.id} onSelect={() => go(inboxHref({ account: a.id }))} icon={<PlatformIcon platform={a.platform} size={16} />}>
                {PLATFORMS[a.platform].name} · {a.label} <span className="ml-1 text-fg-4">{a.handle}</span>
              </Item>
            ))}
          </Command.Group>
        ) : null}

        {matchedActions.length > 0 ? (
          <Command.Group heading={q ? "Commands" : "Quick actions"}>
            {matchedActions.map((a) => (
              <Item key={a.id} onSelect={a.run} icon={a.icon} shortcut={a.shortcut}>
                {a.label}
              </Item>
            ))}
          </Command.Group>
        ) : null}
      </Command.List>

      <div className="flex items-center gap-4 border-t border-line-subtle bg-surface-sunken/60 px-4 py-2 text-[0.6875rem] text-fg-3">
        <span className="inline-flex items-center gap-1.5">
          <Kbd>↑ ↓</Kbd> Navigate
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd>↵</Kbd> Open
        </span>
        <span className="ml-auto hidden sm:inline">
          Try <span className="text-fg-2">“from rahul last week”</span> or <span className="text-fg-2">“whatsapp pdf”</span>
        </span>
      </div>
    </Command>
  );
}

function Item({ children, icon, shortcut, onSelect }: { children: React.ReactNode; icon: React.ReactNode; shortcut?: string; onSelect: () => void }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex h-9 cursor-default items-center gap-3 rounded-md px-2.5 text-[0.8125rem] text-fg-2 data-[selected=true]:bg-hover data-[selected=true]:text-fg [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-3"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut ? <Kbd>{shortcut}</Kbd> : null}
    </Command.Item>
  );
}
