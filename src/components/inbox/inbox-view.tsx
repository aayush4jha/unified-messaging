"use client";

import { ArrowRight, ListChecks, MailOpen, Reply } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { detectFollowUps } from "@/lib/intelligence/followups";
import { useHotkeys } from "@/lib/hotkeys";
import { inboxHref, isFolder } from "@/lib/routes";
import { cn, modKey } from "@/lib/utils";
import { isSnoozed, useNow } from "@/store/selectors";
import { useUI } from "@/store/ui";
import { useWorkspace } from "@/store/workspace";
import { Kbd } from "../ui/kbd";
import { ConversationList, type ListRoute } from "./conversation-list";
import { ConversationView } from "./conversation-view";

export function InboxView() {
  const params = useSearchParams();
  const router = useRouter();
  const folderParam = params.get("folder");
  const route: ListRoute = {
    folder: isFolder(folderParam) ? folderParam : "all",
    accountId: params.get("account") ?? undefined,
    labelId: params.get("label") ?? undefined,
    conversationId: params.get("c") ?? undefined,
  };
  const visibleIds = useUI((s) => s.visibleIds);
  const open = (id: string | undefined) => id && router.replace(inboxHref({ folder: route.folder, account: route.accountId, label: route.labelId, c: id }), { scroll: false });

  useHotkeys(
    {
      j: () => open(visibleIds[0]),
      k: () => open(visibleIds[0]),
      enter: () => open(visibleIds[0]),
    },
    !route.conversationId,
  );

  return (
    <div className="flex h-full min-h-0">
      <ConversationList
        route={route}
        className={cn("w-full lg:w-[372px] lg:shrink-0 xl:w-[392px]", route.conversationId ? "hidden lg:flex" : "flex")}
      />
      {route.conversationId ? (
        <ConversationView key={route.conversationId} conversationId={route.conversationId} route={route} className="flex" />
      ) : (
        <NothingSelected className="hidden lg:flex" />
      )}
    </div>
  );
}

function NothingSelected({ className }: { className?: string }) {
  const conversations = useWorkspace((s) => s.conversations);
  const messages = useWorkspace((s) => s.messages);
  const reminders = useWorkspace((s) => s.reminders);
  const accounts = useWorkspace((s) => s.accounts);
  const now = useNow();

  const stats = useMemo(() => {
    const live = conversations.filter((c) => !c.archived && !isSnoozed(c, now));
    const followUps = detectFollowUps(live, messages, now);
    return {
      unread: live.filter((c) => c.unreadCount > 0).length,
      needsReply: followUps.filter((f) => f.type === "needs_reply").length,
      due: reminders.filter((r) => !r.completedAt && r.dueAt && new Date(r.dueAt).getTime() < now + 86_400_000).length,
    };
  }, [conversations, messages, reminders, now]);

  const hour = new Date(now).getHours();
  const greeting = hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (accounts.length === 0) return <div className={cn("flex-1 bg-bg", className)} />;

  return (
    <section className={cn("flex min-w-0 flex-1 flex-col items-center justify-center bg-bg px-8", className)} aria-label="No conversation selected">
      <div className="w-full max-w-[420px] animate-fade-in">
        <p className="text-[1.375rem] font-semibold tracking-[-0.025em] text-fg">{greeting}.</p>
        <p className="mt-1 text-[0.875rem] text-fg-3">Here&apos;s where things stand across {accounts.length} accounts.</p>
        <div className="mt-6 overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
          <StatRow href={inboxHref({ folder: "unread" })} icon={<MailOpen />} label="Unread conversations" value={stats.unread} />
          <StatRow href="/assistant" icon={<Reply />} label="Waiting on your reply" value={stats.needsReply} />
          <StatRow href="/follow-ups" icon={<ListChecks />} label="Follow-ups due today" value={stats.due} />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs text-fg-3">
          <Hint keys="J K" label="Move through conversations" />
          <Hint keys={`${modKey()} K`} label="Search & commands" />
          <Hint keys="C" label="Compose" />
          <Hint keys="E" label="Archive" />
          <Hint keys="H" label="Snooze" />
          <Hint keys="?" label="All shortcuts" />
        </div>
      </div>
    </section>
  );
}

function StatRow({ href, icon, label, value }: { href: string; icon: React.ReactNode; label: string; value: number }) {
  return (
    <Link href={href} className="group flex items-center gap-3 border-b border-line-subtle px-4 py-3 last:border-b-0 hover:bg-hover [&_svg]:size-4">
      <span className="text-fg-3">{icon}</span>
      <span className="flex-1 text-[0.8125rem] text-fg-2">{label}</span>
      <span className={cn("tabular text-[0.9375rem] font-semibold", value > 0 ? "text-fg" : "text-fg-4")}>{value}</span>
      <ArrowRight className="!size-3.5 text-fg-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Kbd className="w-14 justify-start">{keys}</Kbd>
      <span>{label}</span>
    </div>
  );
}
