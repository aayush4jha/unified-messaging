"use client";

import {
  Archive,
  BarChart3,
  Bell,
  ChevronDown,
  ChevronLeft,
  Clock,
  EyeOff,
  FileText,
  Inbox,
  ListChecks,
  MailOpen,
  MoreHorizontal,
  PanelLeft,
  PenSquare,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  Settings,
  Settings2,
  Sparkles,
  Star,
  TriangleAlert,
  Users,
  ArrowUp,
  ArrowDown,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { PLATFORMS } from "@/lib/platforms";
import { FOLDERS, inboxHref } from "@/lib/routes";
import type { Account, FolderView, PlatformId } from "@/lib/types";
import { cn, modKey } from "@/lib/utils";
import { useEnrichedConversations, useNow, useUnreadByAccount, isSnoozed } from "@/store/selectors";
import { useUI } from "@/store/ui";
import { useWorkspace } from "@/store/workspace";
import { OrbitMark, PlatformIcon } from "../brand/platform-icon";
import { IconButton } from "../ui/button";
import { Count } from "../ui/controls";
import { Kbd } from "../ui/kbd";
import { Menu, MenuCheckboxItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "../ui/menu";
import { Tooltip } from "../ui/tooltip";

const FOLDER_ICONS: Record<FolderView, React.ComponentType<{ className?: string }>> = {
  all: Inbox,
  unread: MailOpen,
  starred: Star,
  important: Zap,
  drafts: FileText,
  scheduled: Clock,
  archived: Archive,
  sent: Send,
};

export function Sidebar({ mobile }: { mobile?: boolean }) {
  const collapsed = useWorkspace((s) => s.prefs.sidebarCollapsed) && !mobile;
  const setPrefs = useWorkspace((s) => s.setPrefs);
  const accounts = useWorkspace((s) => s.accounts);
  const sidebar = useWorkspace((s) => s.sidebar);
  const labels = useWorkspace((s) => s.labels);
  const drafts = useWorkspace((s) => s.drafts);
  const scheduled = useWorkspace((s) => s.scheduled);
  const reminders = useWorkspace((s) => s.reminders);
  const notifications = useWorkspace((s) => s.notifications);
  const mode = useWorkspace((s) => s.mode);
  const toggleSection = useWorkspace((s) => s.toggleSection);
  const conversations = useEnrichedConversations();
  const unreadByAccount = useUnreadByAccount();
  const now = useNow();
  const { openCompose, setPalette, setNotifications, setMobileNav } = useUI();

  const pathname = usePathname();
  const params = useSearchParams();
  const activeFolder = pathname === "/inbox" && !params.get("account") && !params.get("label") ? (params.get("folder") ?? "all") : null;
  const activeAccount = pathname === "/inbox" ? params.get("account") : null;
  const activeLabel = pathname === "/inbox" ? params.get("label") : null;

  const counts = useMemo(() => {
    const live = conversations.filter((c) => !c.archived && !isSnoozed(c, now));
    return {
      all: live.filter((c) => c.unreadCount > 0).length,
      unread: live.filter((c) => c.unreadCount > 0).length,
      starred: conversations.filter((c) => c.starred).length,
      important: live.filter((c) => (c.important || c.priority === "high") && c.unreadCount > 0).length,
      drafts: drafts.length,
      scheduled: scheduled.length,
      archived: 0,
      sent: 0,
    } satisfies Record<FolderView, number>;
  }, [conversations, drafts, scheduled, now]);

  const groups = useMemo(() => {
    const byPlatform = new Map<PlatformId, Account[]>();
    for (const a of accounts) byPlatform.set(a.platform, [...(byPlatform.get(a.platform) ?? []), a]);
    return sidebar.order.filter((p) => byPlatform.has(p) && !sidebar.hiddenPlatforms.includes(p)).map((p) => ({ platform: p, accounts: byPlatform.get(p)! }));
  }, [accounts, sidebar.order, sidebar.hiddenPlatforms]);

  const pinned = accounts.filter((a) => sidebar.pinnedAccounts.includes(a.id));
  const dueFollowUps = reminders.filter((r) => !r.completedAt && r.dueAt && new Date(r.dueAt).getTime() < now + 86_400_000).length;
  const unreadNotifications = notifications.filter((n) => !n.read).length;
  const closeMobile = () => mobile && setMobileNav(false);

  return (
    <nav
      aria-label="Main"
      className={cn(
        "flex h-full shrink-0 flex-col bg-surface-sunken transition-[width] duration-200 ease-out",
        collapsed ? "w-[52px]" : "w-[244px]",
        !mobile && "border-r border-line",
      )}
    >
      {/* Header */}
      <div className={cn("flex h-12 shrink-0 items-center gap-1 px-2.5", collapsed && "justify-center px-0")}>
        {collapsed ? (
          <IconButton label="Expand sidebar" shortcut={`${modKey()} \\`} tooltipSide="right" onClick={() => setPrefs({ sidebarCollapsed: false })}>
            <PanelLeft />
          </IconButton>
        ) : (
          <>
            <Link href="/inbox" className="flex min-w-0 items-center gap-2 rounded-sm px-1 py-1 hover:bg-hover" onClick={closeMobile}>
              <OrbitMark size={22} />
              <span className="truncate text-[0.875rem] font-semibold tracking-[-0.015em]">Orbit</span>
            </Link>
            <div className="ml-auto flex items-center">
              <IconButton
                label="Notifications"
                shortcut="G N"
                onClick={() => setNotifications(true)}
                className="relative"
              >
                <Bell />
                {unreadNotifications > 0 ? <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-accent ring-2 ring-surface-sunken" /> : null}
              </IconButton>
              {!mobile ? (
                <IconButton label="Collapse sidebar" shortcut={`${modKey()} \\`} onClick={() => setPrefs({ sidebarCollapsed: true })}>
                  <ChevronLeft />
                </IconButton>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* Primary actions */}
      <div className={cn("flex shrink-0 gap-1.5 px-2.5 pb-2", collapsed && "flex-col items-center px-0")}>
        {collapsed ? (
          <>
            <IconButton label="Compose" shortcut="C" tooltipSide="right" onClick={() => openCompose()}>
              <PenSquare />
            </IconButton>
            <IconButton label="Search" shortcut={`${modKey()} K`} tooltipSide="right" onClick={() => setPalette(true)}>
              <Search />
            </IconButton>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setPalette(true)}
              className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-sm border border-line bg-surface px-2 text-[0.8125rem] text-fg-3 shadow-xs transition-colors hover:border-line-strong hover:text-fg-2"
            >
              <Search className="size-3.5 shrink-0" />
              <span className="truncate">Search</span>
              <Kbd className="ml-auto">{`${modKey()} K`}</Kbd>
            </button>
            <Tooltip label="New message" shortcut="C">
              <button
                type="button"
                aria-label="Compose"
                onClick={() => {
                  openCompose();
                  closeMobile();
                }}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm bg-accent text-accent-contrast shadow-xs transition-[background-color,transform] hover:bg-accent-hover active:scale-95"
              >
                <PenSquare className="size-4" />
              </button>
            </Tooltip>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2 scrollbar-thin">
        {/* Folders */}
        {!sidebar.hiddenSections.includes("folders") ? (
          <Section collapsed={collapsed}>
            {FOLDERS.map((f) => {
              const Icon = FOLDER_ICONS[f.id];
              return (
                <NavItem
                  key={f.id}
                  href={inboxHref({ folder: f.id })}
                  icon={<Icon />}
                  label={f.label}
                  active={activeFolder === f.id}
                  count={f.id === "all" || f.id === "unread" || f.id === "important" ? counts[f.id] : f.id === "drafts" || f.id === "scheduled" ? counts[f.id] : 0}
                  countTone={f.id === "all" ? "accent" : "muted"}
                  collapsed={collapsed}
                  shortcut={f.shortcut}
                  onNavigate={closeMobile}
                />
              );
            })}
          </Section>
        ) : null}

        {/* Pinned accounts */}
        {pinned.length > 0 && !sidebar.hiddenSections.includes("pinned") ? (
          <Section title="Pinned" collapsed={collapsed}>
            {pinned.map((a) => (
              <AccountItem key={a.id} account={a} unread={unreadByAccount[a.id] ?? 0} active={activeAccount === a.id} collapsed={collapsed} onNavigate={closeMobile} showPlatform />
            ))}
          </Section>
        ) : null}

        {/* Accounts by platform */}
        {!sidebar.hiddenSections.includes("accounts") ? (
          <Section
            title="Accounts"
            collapsed={collapsed}
            action={
              <Tooltip label="Connect an account">
                <Link href="/settings?tab=accounts&connect=1" className="inline-flex size-5 items-center justify-center rounded-[4px] text-fg-4 hover:bg-hover hover:text-fg-2" aria-label="Connect an account">
                  <Plus className="size-3.5" />
                </Link>
              </Tooltip>
            }
          >
            {groups.length === 0 && !collapsed ? (
              <Link
                href="/settings?tab=accounts&connect=1"
                className="mx-1 flex items-center gap-2 rounded-sm border border-dashed border-line-strong px-2.5 py-2 text-[0.8125rem] text-fg-3 transition-colors hover:border-accent hover:text-fg"
              >
                <Plus className="size-3.5" /> Connect your first account
              </Link>
            ) : null}
            {groups.map((g) => (
              <PlatformGroup
                key={g.platform}
                platform={g.platform}
                accounts={g.accounts}
                unreadByAccount={unreadByAccount}
                activeAccount={activeAccount}
                collapsed={collapsed}
                onNavigate={closeMobile}
              />
            ))}
          </Section>
        ) : null}

        {/* Labels */}
        {labels.length > 0 && !collapsed && !sidebar.hiddenSections.includes("folders") ? (
          <Section title="Labels" collapsed={collapsed}>
            {labels.map((l) => (
              <NavItem
                key={l.id}
                href={inboxHref({ label: l.id })}
                icon={<span className="mx-[3px] size-2 rounded-full" style={{ background: `oklch(0.65 0.13 ${l.hue})` }} />}
                label={l.name}
                active={activeLabel === l.id}
                collapsed={collapsed}
                onNavigate={closeMobile}
              />
            ))}
          </Section>
        ) : null}

        {/* Workspace */}
        {!sidebar.hiddenSections.includes("workspace") ? (
          <Section title="Workspace" collapsed={collapsed}>
            <NavItem href="/contacts" icon={<Users />} label="Contacts" active={pathname.startsWith("/contacts")} collapsed={collapsed} onNavigate={closeMobile} shortcut="G C" />
            <NavItem href="/follow-ups" icon={<ListChecks />} label="Follow-ups" active={pathname.startsWith("/follow-ups")} collapsed={collapsed} count={dueFollowUps} onNavigate={closeMobile} shortcut="G F" />
            <NavItem href="/analytics" icon={<BarChart3 />} label="Analytics" active={pathname.startsWith("/analytics")} collapsed={collapsed} onNavigate={closeMobile} />
            <NavItem href="/assistant" icon={<Sparkles />} label="Assistant" active={pathname.startsWith("/assistant")} collapsed={collapsed} onNavigate={closeMobile} shortcut="G A" />
          </Section>
        ) : null}
      </div>

      {/* Footer */}
      <div className={cn("shrink-0 border-t border-line-subtle p-2", collapsed && "flex flex-col items-center gap-1 px-0")}>
        {collapsed ? (
          <>
            <NavItem href="/settings" icon={<Settings />} label="Settings" active={pathname.startsWith("/settings")} collapsed onNavigate={closeMobile} />
          </>
        ) : (
          <div className="flex items-center gap-1">
            <NavItem href="/settings" icon={<Settings />} label="Settings" active={pathname.startsWith("/settings")} collapsed={false} onNavigate={closeMobile} className="flex-1" shortcut={`${modKey()} ,`} />
            <SidebarCustomizeMenu hiddenSections={sidebar.hiddenSections} onToggle={toggleSection} />
          </div>
        )}
        {mode === "demo" && !collapsed ? (
          <Link
            href="/settings?tab=accounts"
            className="mt-1.5 flex items-center gap-2 rounded-sm bg-warning-soft px-2.5 py-2 text-xs leading-4 text-fg-2 transition-colors hover:text-fg"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-warning" />
            <span>
              <span className="font-medium text-fg">Sample workspace.</span> Nothing here is synced from real accounts.
            </span>
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

function Section({ title, children, collapsed, action }: { title?: string; children: React.ReactNode; collapsed: boolean; action?: React.ReactNode }) {
  return (
    <div className={cn("px-2 pt-2", collapsed && "px-0")}>
      {title && !collapsed ? (
        <div className="group/section flex h-7 items-center px-2 text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-fg-4">
          <span>{title}</span>
          {action ? <span className="ml-auto opacity-0 transition-opacity group-hover/section:opacity-100 focus-within:opacity-100">{action}</span> : null}
        </div>
      ) : title && collapsed ? (
        <div className="mx-auto my-1.5 h-px w-6 bg-line" />
      ) : null}
      <div className={cn("flex flex-col gap-px", collapsed && "items-center")}>{children}</div>
    </div>
  );
}

function NavItem({
  href,
  icon,
  label,
  active,
  count,
  countTone = "muted",
  collapsed,
  shortcut,
  onNavigate,
  className,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  count?: number;
  countTone?: "muted" | "accent";
  collapsed: boolean;
  shortcut?: string;
  onNavigate?: () => void;
  className?: string;
}) {
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-[var(--nav-h)] items-center gap-2.5 rounded-sm px-2 text-[0.8125rem] text-fg-2 transition-colors duration-100 hover:bg-hover hover:text-fg [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-3",
        active && "bg-active font-medium text-fg [&_svg]:text-fg",
        collapsed && "size-8 justify-center px-0",
        className,
      )}
    >
      {icon}
      {!collapsed ? <span className="truncate">{label}</span> : null}
      {!collapsed && count ? <Count value={count} tone={countTone} /> : null}
      {collapsed && count ? <span className="absolute right-1 top-1 size-1.5 rounded-full bg-accent" /> : null}
    </Link>
  );
  if (collapsed)
    return (
      <Tooltip label={count ? `${label} · ${count}` : label} shortcut={shortcut} side="right">
        {link}
      </Tooltip>
    );
  return link;
}

function PlatformGroup({
  platform,
  accounts,
  unreadByAccount,
  activeAccount,
  collapsed,
  onNavigate,
}: {
  platform: PlatformId;
  accounts: Account[];
  unreadByAccount: Record<string, number>;
  activeAccount: string | null;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const isCollapsed = useWorkspace((s) => s.sidebar.collapsed.includes(platform));
  const toggle = useWorkspace((s) => s.toggleSidebarPlatform);
  const move = useWorkspace((s) => s.movePlatform);
  const hide = useWorkspace((s) => s.togglePlatformHidden);
  const info = PLATFORMS[platform];
  const total = accounts.reduce((n, a) => n + (unreadByAccount[a.id] ?? 0), 0);

  if (collapsed) {
    return (
      <>
        {accounts.map((a) => (
          <AccountItem key={a.id} account={a} unread={unreadByAccount[a.id] ?? 0} active={activeAccount === a.id} collapsed onNavigate={onNavigate} showPlatform />
        ))}
      </>
    );
  }

  return (
    <div className="group/platform">
      <div className="flex h-[var(--nav-h)] items-center rounded-sm pr-1 hover:bg-hover">
        <button
          type="button"
          onClick={() => toggle(platform)}
          aria-expanded={!isCollapsed}
          className="flex h-full min-w-0 flex-1 items-center gap-2.5 px-2 text-[0.8125rem] font-medium text-fg-2"
        >
          <PlatformIcon platform={platform} size={16} />
          <span className="truncate">{info.name}</span>
          <ChevronDown className={cn("size-3 shrink-0 text-fg-4 transition-transform duration-150", isCollapsed && "-rotate-90")} />
          {isCollapsed && total > 0 ? <Count value={total} /> : null}
        </button>
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              aria-label={`${info.name} options`}
              className="inline-flex size-5 items-center justify-center rounded-[4px] text-fg-4 opacity-0 transition-opacity hover:bg-active hover:text-fg-2 focus:opacity-100 group-hover/platform:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={() => move(platform, -1)}>
              <ArrowUp /> Move up
            </MenuItem>
            <MenuItem onSelect={() => move(platform, 1)}>
              <ArrowDown /> Move down
            </MenuItem>
            <MenuItem onSelect={() => hide(platform)}>
              <EyeOff /> Hide from sidebar
            </MenuItem>
            <MenuSeparator />
            <MenuItem asChild>
              <Link href={`/settings?tab=accounts&platform=${platform}`}>
                <Settings2 /> Manage {info.name} accounts
              </Link>
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]")}>
        <div className="overflow-hidden">
          {accounts.map((a) => (
            <AccountItem key={a.id} account={a} unread={unreadByAccount[a.id] ?? 0} active={activeAccount === a.id} collapsed={false} onNavigate={onNavigate} indent />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusDot({ account }: { account: Account }) {
  if (account.status === "needs_reauth" || account.status === "error")
    return (
      <Tooltip label={account.statusMessage ?? "Needs attention"}>
        <TriangleAlert className={cn("!size-3.5 shrink-0", account.status === "error" ? "!text-danger" : "!text-warning")} aria-label="Needs attention" />
      </Tooltip>
    );
  if (account.status === "syncing") return <span className="size-1.5 shrink-0 rounded-full bg-accent animate-pulse-dot" aria-label="Syncing" />;
  if (account.status === "paused") return <span className="size-1.5 shrink-0 rounded-full bg-fg-4" aria-label="Paused" />;
  return null;
}

function AccountItem({
  account,
  unread,
  active,
  collapsed,
  indent,
  showPlatform,
  onNavigate,
}: {
  account: Account;
  unread: number;
  active: boolean;
  collapsed: boolean;
  indent?: boolean;
  showPlatform?: boolean;
  onNavigate?: () => void;
}) {
  const togglePin = useWorkspace((s) => s.togglePinnedAccount);
  const isPinned = useWorkspace((s) => s.sidebar.pinnedAccounts.includes(account.id));
  const info = PLATFORMS[account.platform];

  if (collapsed) {
    return (
      <Tooltip label={`${info.name} · ${account.label}${unread ? ` · ${unread} unread` : ""}`} side="right">
        <Link
          href={inboxHref({ account: account.id })}
          onClick={onNavigate}
          aria-label={`${info.name} ${account.label}`}
          className={cn("relative inline-flex size-8 items-center justify-center rounded-sm hover:bg-hover", active && "bg-active")}
        >
          <PlatformIcon platform={account.platform} size={18} />
          {unread > 0 ? <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-accent ring-2 ring-surface-sunken" /> : null}
        </Link>
      </Tooltip>
    );
  }

  return (
    <div className={cn("group/account relative flex h-[var(--nav-h)] items-center rounded-sm hover:bg-hover", active && "bg-active")}>
      <Link
        href={inboxHref({ account: account.id })}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn("flex h-full min-w-0 flex-1 items-center gap-2.5 pr-1 text-[0.8125rem] text-fg-2 hover:text-fg", indent ? "pl-[34px]" : "pl-2", active && "font-medium text-fg")}
        title={account.handle}
      >
        {showPlatform ? <PlatformIcon platform={account.platform} size={16} /> : null}
        <span className="truncate">{showPlatform ? `${info.shortName} · ${account.label}` : account.label}</span>
        <StatusDot account={account} />
        <span className="ml-auto flex items-center pr-1">
          <Count value={unread} className="group-hover/account:hidden" />
        </span>
      </Link>
      <button
        type="button"
        onClick={() => togglePin(account.id)}
        aria-label={isPinned ? `Unpin ${account.label}` : `Pin ${account.label}`}
        className="absolute right-1 hidden size-5 items-center justify-center rounded-[4px] text-fg-4 hover:bg-active hover:text-fg-2 focus:flex group-hover/account:flex"
      >
        {isPinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
      </button>
    </div>
  );
}

function SidebarCustomizeMenu({
  hiddenSections,
  onToggle,
}: {
  hiddenSections: string[];
  onToggle: (s: "folders" | "pinned" | "accounts" | "workspace") => void;
}) {
  const hiddenPlatforms = useWorkspace((s) => s.sidebar.hiddenPlatforms);
  const unhide = useWorkspace((s) => s.togglePlatformHidden);
  const setPrefs = useWorkspace((s) => s.setPrefs);
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton label="Customize sidebar">
          <MoreHorizontal />
        </IconButton>
      </MenuTrigger>
      <MenuContent align="end" side="top" className="w-56">
        <MenuLabel>Show sections</MenuLabel>
        {(["folders", "pinned", "accounts", "workspace"] as const).map((s) => (
          <MenuCheckboxItem key={s} checked={!hiddenSections.includes(s)} onCheckedChange={() => onToggle(s)} onSelect={(e) => e.preventDefault()}>
            {s === "folders" ? "Folders & labels" : s === "pinned" ? "Pinned accounts" : s === "accounts" ? "Accounts" : "Workspace"}
          </MenuCheckboxItem>
        ))}
        {hiddenPlatforms.length > 0 ? (
          <>
            <MenuSeparator />
            <MenuLabel>Hidden platforms</MenuLabel>
            {hiddenPlatforms.map((p) => (
              <MenuItem key={p} onSelect={() => unhide(p)}>
                <PlatformIcon platform={p} size={14} /> Show {PLATFORMS[p].name}
              </MenuItem>
            ))}
          </>
        ) : null}
        <MenuSeparator />
        <MenuItem onSelect={() => setPrefs({ sidebarCollapsed: true })}>
          <ChevronLeft /> Collapse sidebar
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
