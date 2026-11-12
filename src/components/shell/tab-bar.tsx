"use client";

import { Inbox, ListChecks, Menu as MenuIcon, PenSquare, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { haptic } from "@/lib/gestures";
import { inboxHref } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { isSnoozed, useNow } from "@/store/selectors";
import { useUI } from "@/store/ui";
import { useWorkspace } from "@/store/workspace";

/**
 * Phone navigation: a bottom tab bar within thumb reach, the way native
 * messaging apps work. Hidden inside a conversation or contact (the composer
 * and the back gesture own the bottom of the screen there).
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const params = useSearchParams();
  const openCompose = useUI((s) => s.openCompose);
  const setMobileNav = useUI((s) => s.setMobileNav);
  const conversations = useWorkspace((s) => s.conversations);
  const reminders = useWorkspace((s) => s.reminders);
  const now = useNow();

  const unread = useMemo(() => conversations.filter((c) => c.unreadCount > 0 && !c.archived && !isSnoozed(c, now)).length, [conversations, now]);
  const due = useMemo(() => {
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    return reminders.filter((r) => !r.completedAt && r.dueAt && new Date(r.dueAt).getTime() <= endOfDay.getTime()).length;
  }, [reminders, now]);

  const inDetail = (pathname === "/inbox" && params.get("c")) || (pathname === "/contacts" && params.get("id"));
  if (inDetail) return null;

  return (
    <nav aria-label="Primary" className="flex shrink-0 items-stretch border-t border-line bg-surface/95 pb-safe backdrop-blur-md md:hidden">
      <Tab href={inboxHref()} label="Inbox" icon={<Inbox />} active={pathname === "/inbox"} badge={unread} badgeLabel={`${unread} unread`} />
      <Tab href="/search" label="Search" icon={<Search />} active={pathname === "/search"} />
      <div className="flex flex-1 items-center justify-center">
        <button
          type="button"
          aria-label="New message"
          onClick={() => {
            haptic(8);
            openCompose();
          }}
          className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-contrast shadow-md transition-transform active:scale-95 [&_svg]:size-5"
        >
          <PenSquare />
        </button>
      </div>
      <Tab href="/follow-ups" label="Follow-ups" icon={<ListChecks />} active={pathname === "/follow-ups"} badge={due} badgeLabel={`${due} due today`} />
      <button
        type="button"
        onClick={() => setMobileNav(true)}
        className="flex h-[58px] flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium text-fg-3 [&_svg]:size-[22px]"
      >
        <MenuIcon aria-hidden />
        More
      </button>
    </nav>
  );
}

function Tab({ href, label, icon, active, badge, badgeLabel }: { href: string; label: string; icon: React.ReactNode; active: boolean; badge?: number; badgeLabel?: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("relative flex h-[58px] flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium transition-colors [&_svg]:size-[22px]", active ? "text-fg" : "text-fg-3")}
    >
      <span className="relative" aria-hidden>
        {icon}
        {badge ? (
          <span className="tabular absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.625rem] font-semibold leading-none text-accent-contrast ring-2 ring-surface">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      {label}
      {badge ? <span className="sr-only">, {badgeLabel}</span> : null}
      {active ? <span className="absolute top-0 h-0.5 w-8 rounded-full bg-fg" aria-hidden /> : null}
    </Link>
  );
}
