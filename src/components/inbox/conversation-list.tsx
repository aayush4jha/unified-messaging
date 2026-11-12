"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowDownUp,
  CheckCheck,
  Clock,
  ExternalLink,
  FileText,
  Inbox,
  Mail,
  Menu as MenuIcon,
  RefreshCw,
  Send,
  Sparkles,
  Star,
  Tag,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PLATFORMS, capabilitiesFor } from "@/lib/platforms";
import { FOLDERS, inboxHref } from "@/lib/routes";
import type { FolderView, QuickFilter, SortMode } from "@/lib/types";
import { cn, formatDue, formatListTime, formatRelative } from "@/lib/utils";
import { filterConversations, useEnrichedConversations, useNow, useSentConversationIds } from "@/store/selectors";
import { useUI } from "@/store/ui";
import { useWorkspace } from "@/store/workspace";
import { PlatformIcon } from "../brand/platform-icon";
import { Button, IconButton } from "../ui/button";
import { confirm } from "../ui/dialog";
import { EmptyState } from "../ui/empty";
import { Menu, MenuCheckboxItem, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from "../ui/menu";
import { useConversationActions } from "./actions";
import { usePullToRefresh } from "@/lib/gestures";
import { InstallBanner } from "../pwa/install";
import { ConversationRow } from "./conversation-row";

const FILTERS: { id: QuickFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "starred", label: "Starred" },
  { id: "priority", label: "Priority" },
  { id: "personal", label: "Personal" },
  { id: "professional", label: "Professional" },
  { id: "work", label: "Work" },
];

const SORTS: { id: SortMode; label: string }[] = [
  { id: "recent", label: "Most recent" },
  { id: "oldest", label: "Oldest first" },
  { id: "unread", label: "Unread first" },
  { id: "priority", label: "Priority" },
  { id: "platform", label: "Platform" },
];

export interface ListRoute {
  folder: FolderView;
  accountId?: string;
  labelId?: string;
  conversationId?: string;
}

export function ConversationList({ route, className }: { route: ListRoute; className?: string }) {
  const router = useRouter();
  const now = useNow();
  const accounts = useWorkspace((s) => s.accounts);
  const labels = useWorkspace((s) => s.labels);
  const drafts = useWorkspace((s) => s.drafts);
  const mode = useWorkspace((s) => s.mode);
  const defaultFilter = useWorkspace((s) => s.prefs.defaultFilter);
  const conversations = useEnrichedConversations();
  const sentIds = useSentConversationIds();
  const { selection, setSelection, toggleSelected, setVisibleIds, setMobileNav } = useUI();
  const actions = useConversationActions();

  const [filter, setFilter] = useState<QuickFilter>(defaultFilter);
  const [sort, setSort] = useState<SortMode>("recent");
  const lastChecked = useRef<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const account = route.accountId ? accounts.find((a) => a.id === route.accountId) : undefined;
  const label = route.labelId ? labels.find((l) => l.id === route.labelId) : undefined;
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const draftConvIds = useMemo(() => new Set(drafts.map((d) => d.conversationId).filter(Boolean) as string[]), [drafts]);

  const list = useMemo(
    () => filterConversations(conversations, { folder: route.accountId || route.labelId ? "all" : route.folder, accountId: route.accountId, labelId: route.labelId, filter, sort, sentIds }, now),
    [conversations, route.folder, route.accountId, route.labelId, filter, sort, sentIds, now],
  );

  useEffect(() => {
    setVisibleIds(list.map((c) => c.id));
  }, [list, setVisibleIds]);

  // Clear bulk selection when the view changes
  useEffect(() => {
    setSelection([]);
  }, [route.folder, route.accountId, route.labelId, setSelection]);

  const hrefFor = (id: string) => inboxHref({ folder: route.folder, account: route.accountId, label: route.labelId, c: id });

  const onToggleCheck = (id: string, range: boolean) => {
    if (range && lastChecked.current) {
      const ids = list.map((c) => c.id);
      const a = ids.indexOf(lastChecked.current);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a];
        setSelection(Array.from(new Set([...selection, ...ids.slice(from, to + 1)])));
        return;
      }
    }
    lastChecked.current = id;
    toggleSelected(id);
  };

  // After archive/snooze of the open conversation, move to the next one
  const onAfterRemove = (id: string) => {
    if (route.conversationId !== id) return;
    const idx = list.findIndex((c) => c.id === id);
    const next = list[idx + 1] ?? list[idx - 1];
    router.replace(next && next.id !== id ? hrefFor(next.id) : inboxHref({ folder: route.folder, account: route.accountId, label: route.labelId }), { scroll: false });
  };

  const title = account
    ? account.label
    : label
      ? label.name
      : (FOLDERS.find((f) => f.id === route.folder)?.label ?? "Inbox");
  const unreadInView = list.filter((c) => c.unreadCount > 0).length;
  const isConvFolder = route.folder !== "drafts" && route.folder !== "scheduled";

  return (
    <section aria-label="Conversations" className={cn("flex h-full min-h-0 flex-col border-r border-line bg-surface", className)}>
      {/* Header */}
      <header className="shrink-0 border-b border-line-subtle">
        <div className="flex h-12 items-center gap-2 px-3 pl-4">
          <IconButton label="Open navigation" className="-ml-1.5 md:hidden" onClick={() => setMobileNav(true)}>
            <MenuIcon />
          </IconButton>
          {account ? <PlatformIcon platform={account.platform} size={18} /> : null}
          {label ? <span className="size-2.5 rounded-full" style={{ background: `oklch(0.65 0.13 ${label.hue})` }} /> : null}
          <div className="min-w-0">
            <h1 className="truncate text-[0.9375rem] font-semibold tracking-[-0.015em]">{account ? `${PLATFORMS[account.platform].name} · ${title}` : title}</h1>
          </div>
          {isConvFolder && unreadInView > 0 ? <span className="tabular shrink-0 text-xs text-fg-3">{unreadInView} unread</span> : null}
          <div className="ml-auto flex items-center gap-0.5">
            {isConvFolder ? (
              <>
                {account ? (
                  <IconButton
                    label="Sync now"
                    onClick={() => {
                      if (account.isDemo) toast("Sample accounts don't sync", { description: "Connect a real account to sync messages." });
                      else void fetch(`/api/sync/${account.id}`, { method: "POST" }).then((r) => toast(r.ok ? "Sync started" : "Couldn't start sync"));
                    }}
                  >
                    <RefreshCw />
                  </IconButton>
                ) : null}
                <Menu>
                  <MenuTrigger asChild>
                    <IconButton label="Sort">
                      <ArrowDownUp />
                    </IconButton>
                  </MenuTrigger>
                  <MenuContent align="end">
                    <MenuLabel>Sort by</MenuLabel>
                    <MenuRadioGroup value={sort} onValueChange={(v) => setSort(v as SortMode)}>
                      {SORTS.map((s) => (
                        <MenuRadioItem key={s.id} value={s.id}>
                          {s.label}
                        </MenuRadioItem>
                      ))}
                    </MenuRadioGroup>
                  </MenuContent>
                </Menu>
                <IconButton
                  label="Mark all as read"
                  disabled={unreadInView === 0}
                  onClick={() => {
                    const ids = list.filter((c) => c.unreadCount > 0).map((c) => c.id);
                    ids.forEach((id) => useWorkspace.getState().markRead(id));
                    toast(`Marked ${ids.length} as read`, {
                      action: { label: "Undo", onClick: () => ids.forEach((id) => useWorkspace.getState().markUnread(id)) },
                    });
                  }}
                >
                  <CheckCheck />
                </IconButton>
              </>
            ) : null}
          </div>
        </div>

        {/* Filters */}
        {isConvFolder ? (
          <div className="flex items-center gap-1 overflow-x-auto px-3 pb-2.5 pl-4 scrollbar-none [mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)]" role="group" aria-label="Filters">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "h-6 shrink-0 rounded-full px-2.5 text-xs font-medium transition-colors",
                  filter === f.id ? "bg-fg text-fg-inverse" : "text-fg-3 hover:bg-hover hover:text-fg",
                )}
              >
                {f.label}
              </button>
            ))}
            {labels.length > 0 && !route.labelId ? (
              <Menu>
                <MenuTrigger asChild>
                  <button className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-fg-3 hover:bg-hover hover:text-fg">
                    <Tag className="size-3" /> Labels
                  </button>
                </MenuTrigger>
                <MenuContent>
                  {labels.map((l) => (
                    <MenuItem key={l.id} asChild>
                      <Link href={inboxHref({ label: l.id })}>
                        <span className="mx-1 size-2 rounded-full" style={{ background: `oklch(0.65 0.13 ${l.hue})` }} />
                        {l.name}
                      </Link>
                    </MenuItem>
                  ))}
                  <MenuSeparator />
                  <MenuItem asChild>
                    <Link href="/settings?tab=labels">Manage labels…</Link>
                  </MenuItem>
                </MenuContent>
              </Menu>
            ) : null}
          </div>
        ) : null}
      </header>

      {/* Account status notice */}
      {account ? <AccountNotice accountId={account.id} /> : null}
      {mode === "demo" && !account ? <DemoNotice /> : null}
      {!account ? <InstallBanner /> : null}

      {/* Bulk actions */}
      {selection.length > 0 ? (
        <div className="flex shrink-0 items-center gap-1 border-b border-line-subtle bg-accent-soft px-3 py-1.5 animate-fade-in">
          <IconButton size="xs" label="Clear selection" onClick={() => setSelection([])}>
            <X />
          </IconButton>
          <span className="text-xs font-medium text-fg">{selection.length} selected</span>
          <button className="ml-1 text-xs text-accent-text hover:underline" onClick={() => setSelection(list.map((c) => c.id))}>
            Select all {list.length}
          </button>
          <div className="ml-auto flex items-center gap-0.5">
            <IconButton
              size="xs"
              label={route.folder === "archived" ? "Move to inbox" : "Archive"}
              onClick={() => {
                actions.archiveMany(selection, route.folder !== "archived");
                setSelection([]);
              }}
            >
              {route.folder === "archived" ? <ArchiveRestore /> : <Archive />}
            </IconButton>
            <IconButton
              size="xs"
              label="Mark as read"
              onClick={() => {
                selection.forEach((id) => useWorkspace.getState().markRead(id));
                setSelection([]);
              }}
            >
              <CheckCheck />
            </IconButton>
            <IconButton
              size="xs"
              label="Mark as unread"
              onClick={() => {
                selection.forEach((id) => useWorkspace.getState().markUnread(id));
                setSelection([]);
              }}
            >
              <Mail />
            </IconButton>
            <IconButton
              size="xs"
              label="Star"
              onClick={() => {
                const ws = useWorkspace.getState();
                selection.forEach((id) => {
                  const c = ws.conversations.find((x) => x.id === id);
                  if (c && !c.starred) ws.toggleStar(id);
                });
                setSelection([]);
              }}
            >
              <Star />
            </IconButton>
            {labels.length > 0 ? (
              <Menu>
                <MenuTrigger asChild>
                  <IconButton size="xs" label="Label">
                    <Tag />
                  </IconButton>
                </MenuTrigger>
                <MenuContent align="end">
                  <MenuLabel>Apply label</MenuLabel>
                  {labels.map((l) => {
                    const all = selection.every((id) => conversations.find((c) => c.id === id)?.labels.includes(l.id));
                    return (
                      <MenuCheckboxItem
                        key={l.id}
                        checked={all}
                        onCheckedChange={() => {
                          const ws = useWorkspace.getState();
                          selection.forEach((id) => {
                            const has = ws.conversations.find((c) => c.id === id)?.labels.includes(l.id);
                            if (all ? has : !has) ws.toggleLabel(id, l.id);
                          });
                        }}
                      >
                        <span className="mx-1 size-2 rounded-full" style={{ background: `oklch(0.65 0.13 ${l.hue})` }} />
                        {l.name}
                      </MenuCheckboxItem>
                    );
                  })}
                </MenuContent>
              </Menu>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Body */}
      <div className="relative min-h-0 flex-1">
      <PullToRefresh scrollRef={bodyRef} enabled={isConvFolder} />
      <div ref={bodyRef} className="h-full overflow-y-auto overscroll-y-contain scrollbar-thin" role={isConvFolder ? "list" : undefined} aria-label={title}>
        {route.folder === "drafts" && !route.accountId && !route.labelId ? (
          <DraftsList />
        ) : route.folder === "scheduled" && !route.accountId && !route.labelId ? (
          <ScheduledList />
        ) : list.length === 0 ? (
          <ListEmpty folder={route.folder} filter={filter} hasAccounts={accounts.length > 0} onClearFilter={() => setFilter("all")} accountLabel={account?.label} />
        ) : (
          list.map((c, i) => (
            <div key={c.id} className="animate-slide-up" style={{ animationDelay: `${Math.min(i, 12) * 14}ms`, animationFillMode: "backwards" }}>
              <ConversationRow
                conversation={c}
                account={accountById.get(c.accountId)}
                labels={labels}
                href={hrefFor(c.id)}
                selected={route.conversationId === c.id}
                checked={selection.includes(c.id)}
                focused={false}
                hasDraft={draftConvIds.has(c.id)}
                now={now}
                onToggleCheck={onToggleCheck}
                onAfterRemove={onAfterRemove}
              />
            </div>
          ))
        )}
      </div>
      </div>
    </section>
  );
}

/** Refreshes every live account; sample data just confirms it's current. */
async function refreshInbox() {
  const { mode, accounts } = useWorkspace.getState();
  const live = accounts.filter((a) => !a.isDemo);
  if (mode !== "live" || live.length === 0) {
    await new Promise((r) => setTimeout(r, 500));
    toast("You're up to date", { description: mode === "demo" ? "Sample accounts don't sync." : undefined });
    return;
  }
  const timeout = new Promise((r) => setTimeout(r, 15_000));
  await Promise.race([Promise.all(live.map((a) => fetch(`/api/sync/${a.id}`, { method: "POST" }).catch(() => null))), timeout]);
  window.dispatchEvent(new Event("orbit:refresh"));
}

function PullToRefresh({ scrollRef, enabled }: { scrollRef: React.RefObject<HTMLDivElement | null>; enabled: boolean }) {
  const { pull, refreshing, progress } = usePullToRefresh(scrollRef, refreshInbox, enabled);
  if (!pull && !refreshing) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center" style={{ transform: `translateY(${pull - 44}px)` }} role="status" aria-label={refreshing ? "Refreshing" : "Pull to refresh"}>
      <span className="flex size-9 items-center justify-center rounded-full border border-line bg-surface-raised text-fg-2 shadow-md" style={{ opacity: Math.max(0.3, progress) }}>
        <RefreshCw className={cn("size-4", refreshing && "animate-spin")} style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }} />
      </span>
    </div>
  );
}

function DemoNotice() {
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem("orbit-demo-notice") === "hidden";
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  return (
    <div className="mx-3 mt-2.5 flex shrink-0 items-start gap-2.5 rounded-md border border-line bg-surface-sunken px-3 py-2.5 text-xs leading-[1.125rem] text-fg-2 animate-fade-in">
      <Sparkles className="mt-px size-3.5 shrink-0 text-accent-text" />
      <p className="min-w-0 flex-1">
        <span className="font-medium text-fg">You&apos;re exploring sample conversations.</span> Everything works, but nothing is synced from real accounts and sends are simulated.{" "}
        <Link href="/settings?tab=accounts&connect=1" className="font-medium text-accent-text hover:underline">
          Connect an account
        </Link>
      </p>
      <button
        aria-label="Dismiss"
        className="-mr-1 -mt-0.5 rounded-[4px] p-0.5 text-fg-4 hover:bg-hover hover:text-fg-2"
        onClick={() => {
          setHidden(true);
          try {
            sessionStorage.setItem("orbit-demo-notice", "hidden");
          } catch {}
        }}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function AccountNotice({ accountId }: { accountId: string }) {
  const account = useWorkspace((s) => s.accounts.find((a) => a.id === accountId));
  if (!account) return null;
  const info = PLATFORMS[account.platform];
  const caps = capabilitiesFor(account.platform, account.capabilityOverrides);
  const needsAuth = account.status === "needs_reauth" || account.status === "error";
  const previewOnly = !caps.reply && !caps.send;
  if (!needsAuth && !previewOnly) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-line-subtle px-4 py-2 text-xs text-fg-3">
        <span className="truncate">{account.handle}</span>
        <span className="text-fg-4">·</span>
        <span className="shrink-0">{account.lastSyncedAt ? `Synced ${formatRelative(account.lastSyncedAt)}` : "Not synced yet"}</span>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "mx-3 mt-2.5 flex shrink-0 items-start gap-2.5 rounded-md border px-3 py-2.5 text-xs leading-[1.125rem]",
        needsAuth ? "border-[color-mix(in_oklch,var(--warning)_35%,transparent)] bg-warning-soft text-fg-2" : "border-line bg-surface-sunken text-fg-2",
      )}
    >
      <TriangleAlert className={cn("mt-px size-3.5 shrink-0", needsAuth ? "text-warning" : "text-fg-3")} />
      <div className="min-w-0 flex-1">
        <p>
          <span className="font-medium text-fg">{needsAuth ? `${info.name} · ${account.label} needs to reconnect.` : "Read-only preview."}</span> {account.statusMessage ?? info.limitation}
        </p>
        <div className="mt-2 flex gap-1.5">
          {needsAuth ? (
            <Button asChild size="xs" variant="primary">
              <Link href={`/settings?tab=accounts&reconnect=${account.id}`}>Reconnect</Link>
            </Button>
          ) : null}
          {info.alternative ? (
            <Button asChild size="xs" variant="secondary">
              <a href={info.alternative.url} target="_blank" rel="noreferrer">
                {info.alternative.label} <ExternalLink />
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ListEmpty({
  folder,
  filter,
  hasAccounts,
  onClearFilter,
  accountLabel,
}: {
  folder: FolderView;
  filter: QuickFilter;
  hasAccounts: boolean;
  onClearFilter: () => void;
  accountLabel?: string;
}) {
  const loadDemo = useWorkspace((s) => s.loadDemo);
  if (!hasAccounts) {
    return (
      <EmptyState
        icon={<Inbox />}
        title="No accounts connected"
        description="Connect Gmail, Slack or Telegram to bring your conversations into one inbox, or explore Orbit with sample data first."
        action={
          <>
            <Button asChild variant="primary">
              <Link href="/settings?tab=accounts&connect=1">Connect an account</Link>
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                loadDemo();
                toast("Sample workspace loaded", { description: "All sample data is labeled and stays in this browser." });
              }}
            >
              Explore sample data
            </Button>
          </>
        }
      />
    );
  }
  if (filter !== "all") {
    return (
      <EmptyState
        compact
        icon={<Inbox />}
        title="Nothing matches this filter"
        description={`No ${filter} conversations${accountLabel ? ` in ${accountLabel}` : " here"}.`}
        action={
          <Button size="sm" onClick={onClearFilter}>
            Clear filter
          </Button>
        }
      />
    );
  }
  const copy: Partial<Record<FolderView, { title: string; description: string; icon: React.ReactNode }>> = {
    all: { title: "Inbox zero", description: "Every conversation is handled. Enjoy the quiet.", icon: <CheckCheck /> },
    unread: { title: "All caught up", description: "No unread conversations across your accounts.", icon: <CheckCheck /> },
    starred: { title: "No starred conversations", description: "Press S on any conversation to star it for later.", icon: <Star /> },
    important: { title: "Nothing urgent", description: "Conversations marked important, or ranked high priority by your rules, appear here.", icon: <Sparkles /> },
    archived: { title: "Archive is empty", description: "Archived conversations live here. Press E to archive.", icon: <Archive /> },
    sent: { title: "Nothing sent yet", description: "Conversations you've replied to will appear here.", icon: <Send /> },
  };
  const c = copy[folder] ?? copy.all!;
  return <EmptyState compact icon={c.icon} title={c.title} description={c.description} />;
}

function DraftsList() {
  const drafts = useWorkspace((s) => s.drafts);
  const accounts = useWorkspace((s) => s.accounts);
  const deleteDraft = useWorkspace((s) => s.deleteDraft);
  const openCompose = useUI((s) => s.openCompose);
  if (drafts.length === 0) return <EmptyState compact icon={<FileText />} title="No drafts" description="Messages you start and don't send are saved here automatically." />;
  return (
    <div>
      {drafts.map((d) => {
        const account = accounts.find((a) => a.id === d.accountId);
        return (
          <div key={d.id} className="group/draft relative border-b border-line-subtle hover:bg-hover">
            <button
              className="flex w-full gap-3 px-4 py-[var(--row-py)] text-left"
              onClick={() =>
                openCompose({ draftId: d.id, accountId: d.accountId, platform: account?.platform, to: d.to, subject: d.subject, body: d.body, replyToConversationId: d.conversationId })
              }
            >
              {account ? <PlatformIcon platform={account.platform} size={18} className="mt-0.5" /> : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-danger">Draft</span>
                  <span className="truncate text-[0.8125rem] font-medium">{d.to.join(", ") || "No recipient"}</span>
                  <span className="ml-auto shrink-0 text-[0.6875rem] text-fg-3">{formatListTime(d.updatedAt)}</span>
                </div>
                {d.subject ? <div className="truncate text-[0.8125rem] text-fg-2">{d.subject}</div> : null}
                <p className="line-clamp-1 text-[0.8125rem] text-fg-3">{d.body || "Empty draft"}</p>
              </div>
            </button>
            <IconButton
              size="xs"
              label="Discard draft"
              className="absolute right-3 top-2 opacity-0 group-hover/draft:opacity-100"
              onClick={async () => {
                if (await confirm({ title: "Discard this draft?", description: "This can't be undone.", confirmLabel: "Discard", danger: true })) {
                  deleteDraft(d.id);
                  toast("Draft discarded");
                }
              }}
            >
              <Trash2 />
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}

function ScheduledList() {
  const scheduled = useWorkspace((s) => s.scheduled);
  const accounts = useWorkspace((s) => s.accounts);
  const cancel = useWorkspace((s) => s.cancelScheduled);
  const send = useWorkspace((s) => s.send);
  if (scheduled.length === 0)
    return <EmptyState compact icon={<Clock />} title="Nothing scheduled" description="Use the arrow next to Send to schedule a message for later." />;
  return (
    <div>
      {[...scheduled]
        .sort((a, b) => a.sendAt.localeCompare(b.sendAt))
        .map((m) => {
          const account = accounts.find((a) => a.id === m.accountId);
          return (
            <div key={m.id} className="border-b border-line-subtle px-4 py-[var(--row-py)]">
              <div className="flex items-center gap-2">
                {account ? <PlatformIcon platform={account.platform} size={16} /> : null}
                <span className="truncate text-[0.8125rem] font-medium">{m.to.join(", ")}</span>
                <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[0.6875rem] font-medium text-info">
                  <Clock className="size-3" /> {formatDue(m.sendAt)}
                </span>
              </div>
              {m.subject ? <div className="mt-0.5 truncate text-[0.8125rem] text-fg-2">{m.subject}</div> : null}
              <p className="mt-0.5 line-clamp-2 text-[0.8125rem] text-fg-3">{m.body}</p>
              <div className="mt-2 flex gap-1.5">
                <Button
                  size="xs"
                  onClick={async () => {
                    cancel(m.id);
                    const r = await send({ accountId: m.accountId, conversationId: m.conversationId, to: m.to, subject: m.subject, body: m.body, attachments: [] });
                    if (r.ok) toast.success("Sent");
                    else toast.error("Couldn't send", { description: r.error });
                  }}
                >
                  <Send /> Send now
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    cancel(m.id);
                    toast("Scheduled message cancelled", {
                      action: { label: "Undo", onClick: () => useWorkspace.getState().schedule({ accountId: m.accountId, conversationId: m.conversationId, to: m.to, subject: m.subject, body: m.body, sendAt: m.sendAt }) },
                    });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          );
        })}
    </div>
  );
}
