"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Mail,
  MailOpen,
  MoreHorizontal,
  PanelRight,
  Pin,
  PinOff,
  Star,
  Tag,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useHotkeys } from "@/lib/hotkeys";
import { PLATFORMS } from "@/lib/platforms";
import { inboxHref } from "@/lib/routes";
import type { Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useEnrichedConversations } from "@/store/selectors";
import { useUI } from "@/store/ui";
import { useWorkspace } from "@/store/workspace";
import { PlatformIcon } from "../brand/platform-icon";
import { Avatar } from "../ui/avatar";
import { IconButton } from "../ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/controls";
import { EmptyState } from "../ui/empty";
import { Menu, MenuCheckboxItem, MenuContent, MenuGroup, MenuItem, MenuLabel, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from "../ui/menu";
import { Tooltip } from "../ui/tooltip";
import { CustomDateTimeForm, SnoozeMenuItems, useConversationActions } from "./actions";
import { ReplyComposer, type Prefill } from "./composer";
import { ContactPanel } from "./contact-panel";
import { ChatThread, EmailThread, JumpToLatest, ProfessionalThread, SlackThread } from "./messages";
import { useEdgeSwipeBack } from "@/lib/gestures";
import { useDevice } from "@/lib/pwa";
import { useEnsureMessages } from "../live/live-bridge";
import { ReminderPopover } from "./reminder-popover";
import { ConversationInsights } from "./insights";
import type { ListRoute } from "./conversation-list";

export function ConversationView({ conversationId, route, className }: { conversationId: string; route: ListRoute; className?: string }) {
  const router = useRouter();
  const conversations = useEnrichedConversations();
  const conversation = conversations.find((c) => c.id === conversationId);
  const messages = useWorkspace((s) => s.messages[conversationId]) ?? EMPTY;
  const account = useWorkspace((s) => s.accounts.find((a) => a.id === conversation?.accountId));
  const contactsArr = useWorkspace((s) => s.contacts);
  const contacts = useMemo(() => new Map(contactsArr.map((c) => [c.id, c])), [contactsArr]);
  const panelOpen = useWorkspace((s) => s.prefs.contactPanelOpen);
  const setPrefs = useWorkspace((s) => s.setPrefs);
  const markRead = useWorkspace((s) => s.markRead);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEnsureMessages(conversation);
  const [atBottom, setAtBottom] = useState(true);
  const [prefill, setPrefill] = useState<Prefill | null>(null);

  // Opening a conversation marks it read (like every inbox)
  useEffect(() => {
    if (conversation && conversation.unreadCount > 0) {
      const t = setTimeout(() => markRead(conversation.id), 400);
      return () => clearTimeout(t);
    }
  }, [conversation?.id, conversation?.unreadCount, markRead]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to newest on open / new message
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !conversation) return;
    if (conversation.kind === "email") el.scrollTop = 0;
    else el.scrollTop = el.scrollHeight;
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !conversation || conversation.kind === "email") return;
    if (atBottom) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const backHref = inboxHref({ folder: route.folder, account: route.accountId, label: route.labelId });
  const sectionRef = useRef<HTMLElement>(null);
  const device = useDevice();
  useEdgeSwipeBack(sectionRef, () => router.push(backHref), device?.platform === "ios" && device.standalone);

  if (!conversation) {
    return (
      <section className={cn("flex min-w-0 flex-1 items-center justify-center bg-bg", className)}>
        <EmptyState
          icon={<Mail />}
          title="Conversation not found"
          description="It may have been removed when its account was disconnected."
          action={
            <Link href={backHref} className="text-[0.8125rem] font-medium text-accent-text hover:underline">
              Back to inbox
            </Link>
          }
        />
      </section>
    );
  }

  const Thread = conversation.platform === "slack" ? SlackThread : conversation.kind === "email" ? EmailThread : conversation.platform === "linkedin" ? ProfessionalThread : ChatThread;

  return (
    <div className={cn("flex min-w-0 flex-1", className)}>
      <section ref={sectionRef} aria-label="Conversation" className="flex min-w-0 flex-1 flex-col bg-bg">
        <ConversationHeader conversation={conversation} backHref={backHref} route={route} panelOpen={panelOpen} onTogglePanel={() => setPrefs({ contactPanelOpen: !panelOpen })} onRemoved={() => router.replace(backHref, { scroll: false })} />
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            className="h-full overflow-y-auto scrollbar-thin"
            onScroll={(e) => {
              const el = e.currentTarget;
              setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
            }}
          >
            <ConversationInsights conversation={conversation} messages={messages} onUseReply={(text) => setPrefill({ id: Date.now(), text })} />
            <Thread conversation={conversation} messages={messages} account={account} contacts={contacts} />
          </div>
          {!atBottom && conversation.kind !== "email" ? <JumpToLatest onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })} /> : null}
        </div>
        <ReplyComposer conversation={conversation} account={account} messages={messages} prefill={prefill} />
      </section>
      {panelOpen ? <ContactPanel conversation={conversation} className="hidden xl:flex" onClose={() => setPrefs({ contactPanelOpen: false })} /> : null}
    </div>
  );
}

const EMPTY: never[] = [];

function ConversationHeader({
  conversation: c,
  backHref,
  route,
  panelOpen,
  onTogglePanel,
  onRemoved,
}: {
  conversation: Conversation;
  backHref: string;
  route: ListRoute;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onRemoved: () => void;
}) {
  const router = useRouter();
  const account = useWorkspace((s) => s.accounts.find((a) => a.id === c.accountId));
  const labels = useWorkspace((s) => s.labels);
  const { toggleImportant, toggleMute, toggleLabel } = useWorkspace.getState();
  const actions = useConversationActions();
  const visibleIds = useUI((s) => s.visibleIds);
  const focusComposer = useUI((s) => s.focusComposer);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [customSnooze, setCustomSnooze] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const info = PLATFORMS[c.platform];

  const goRelative = (dir: 1 | -1) => {
    const idx = visibleIds.indexOf(c.id);
    const next = visibleIds[idx + dir];
    if (next) router.replace(inboxHref({ folder: route.folder, account: route.accountId, label: route.labelId, c: next }), { scroll: false });
  };
  const afterRemove = () => {
    const idx = visibleIds.indexOf(c.id);
    const next = visibleIds[idx + 1] ?? visibleIds[idx - 1];
    if (next && next !== c.id) router.replace(inboxHref({ folder: route.folder, account: route.accountId, label: route.labelId, c: next }), { scroll: false });
    else onRemoved();
  };

  useHotkeys({
    e: () => actions.archive(c, { onDone: afterRemove }),
    s: () => actions.toggleStar(c),
    u: () => actions.toggleRead(c),
    p: () => actions.togglePin(c),
    h: () => setSnoozeOpen(true),
    "shift+i": () => toggleImportant(c.id),
    r: () => focusComposer(),
    m: () => setReminderOpen(true),
    j: () => goRelative(1),
    k: () => goRelative(-1),
    escape: () => router.replace(backHref, { scroll: false }),
    "]": onTogglePanel,
  });

  const title = c.kind === "channel" ? `#${c.title}` : c.kind === "email" ? (c.participants[0]?.name ?? c.title) : c.title;
  const subtitle =
    c.kind === "channel" ? `${c.participants.length + 1} members` : c.kind === "group" ? c.participants.map((p) => p.name.split(" ")[0]).join(", ") : c.participants[0]?.handle;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 sm:px-4">
      <IconButton label="Back" className="lg:hidden" onClick={() => router.push(backHref)}>
        <ArrowLeft />
      </IconButton>
      <Avatar name={c.kind === "channel" || c.kind === "group" ? c.title : c.participants[0]?.name ?? c.title} hue={c.kind === "group" ? undefined : c.participants[0]?.avatarHue} group={c.kind === "channel"} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h2 className="truncate text-[0.875rem] font-semibold tracking-[-0.01em]">{title}</h2>
          {c.priority === "high" ? (
            <Tooltip label={c.priorityReasons.filter((r) => !r.startsWith("Group")).join(" · ")}>
              <span className="inline-flex h-[18px] items-center gap-0.5 rounded-[4px] bg-accent-soft px-1.5 text-[0.6875rem] font-medium text-accent-text">
                <Zap className="size-3 fill-current" /> Priority
              </span>
            </Tooltip>
          ) : null}
          {c.isDemo ? <span className="hidden rounded-[4px] bg-warning-soft px-1.5 text-[0.6875rem] font-medium leading-[18px] text-fg-2 sm:inline">Sample</span> : null}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-fg-3">
          <PlatformIcon platform={c.platform} size={12} />
          <span className="truncate">
            {info.name} · {account?.label}
            {subtitle ? <span className="hidden sm:inline"> · {subtitle}</span> : null}
          </span>
        </div>
      </div>

      <Popover open={customSnooze} onOpenChange={setCustomSnooze}>
        <PopoverAnchor asChild>
          <div className="flex shrink-0 items-center gap-0.5">
            {/* Phones keep Archive, Remind and ⋯ in the header; Star and Snooze move into ⋯. */}
            <IconButton label={c.starred ? "Unstar" : "Star"} shortcut="S" onClick={() => actions.toggleStar(c)} active={c.starred} className="hidden sm:inline-flex">
              <Star className={cn(c.starred && "fill-[var(--warning)] text-[var(--warning)]")} />
            </IconButton>
            <IconButton label={c.archived ? "Move to inbox" : "Archive"} shortcut="E" onClick={() => actions.archive(c, { onDone: afterRemove })}>
              {c.archived ? <ArchiveRestore /> : <Archive />}
            </IconButton>
            <Menu open={snoozeOpen} onOpenChange={setSnoozeOpen}>
              <MenuTrigger asChild>
                <IconButton label="Snooze" shortcut="H" active={!!c.snoozedUntil} className="hidden sm:inline-flex">
                  <Clock />
                </IconButton>
              </MenuTrigger>
              <MenuContent align="end" className="w-64">
                <MenuLabel>Snooze until</MenuLabel>
                <SnoozeMenuItems conversation={c} onDone={afterRemove} onCustom={() => setTimeout(() => setCustomSnooze(true), 0)} />
              </MenuContent>
            </Menu>
            <ReminderPopover conversation={c} open={reminderOpen} onOpenChange={setReminderOpen}>
              <IconButton label="Remind me / follow up" shortcut="M">
                <Bell />
              </IconButton>
            </ReminderPopover>
            <Menu>
              <MenuTrigger asChild>
                <IconButton label="More actions">
                  <MoreHorizontal />
                </IconButton>
              </MenuTrigger>
              <MenuContent align="end" className="w-60">
                <MenuItem onSelect={() => actions.toggleStar(c)} shortcut="S" className="sm:hidden">
                  <Star /> {c.starred ? "Unstar" : "Star"}
                </MenuItem>
                {/* Phones: snooze options inline (side-by-side submenus don't fit a phone screen). */}
                <MenuGroup className="sm:hidden" aria-label="Snooze">
                  <MenuSeparator />
                  <MenuLabel>Snooze until</MenuLabel>
                  <SnoozeMenuItems conversation={c} onDone={afterRemove} onCustom={() => setTimeout(() => setCustomSnooze(true), 0)} />
                  <MenuSeparator />
                </MenuGroup>
                <MenuItem onSelect={() => actions.toggleRead(c)} shortcut="U">
                  {c.unreadCount > 0 ? <MailOpen /> : <Mail />} Mark as {c.unreadCount > 0 ? "read" : "unread"}
                </MenuItem>
                <MenuItem onSelect={() => actions.togglePin(c)} shortcut="P">
                  {c.pinned ? <PinOff /> : <Pin />} {c.pinned ? "Unpin" : "Pin to top"}
                </MenuItem>
                <MenuItem onSelect={() => toggleImportant(c.id)} shortcut="⇧ I">
                  <Zap /> {c.important ? "Remove importance" : "Mark important"}
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    toggleMute(c.id);
                    toast(c.muted ? "Notifications on" : "Muted", { description: c.muted ? undefined : "You won't be notified about new messages here." });
                  }}
                >
                  {c.muted ? <Bell /> : <BellOff />} {c.muted ? "Unmute" : "Mute"}
                </MenuItem>
                <MenuSub>
                  <MenuSubTrigger>
                    <Tag /> Labels
                  </MenuSubTrigger>
                  <MenuSubContent className="w-48">
                    {labels.length === 0 ? <MenuItem disabled>No labels yet</MenuItem> : null}
                    {labels.map((l) => (
                      <MenuCheckboxItem key={l.id} checked={c.labels.includes(l.id)} onCheckedChange={() => toggleLabel(c.id, l.id)} onSelect={(e) => e.preventDefault()}>
                        <span className="mx-1 size-2 rounded-full" style={{ background: `oklch(0.65 0.13 ${l.hue})` }} />
                        {l.name}
                      </MenuCheckboxItem>
                    ))}
                    <MenuSeparator />
                    <MenuItem asChild>
                      <Link href="/settings?tab=labels">Manage labels…</Link>
                    </MenuItem>
                  </MenuSubContent>
                </MenuSub>
                <MenuSeparator />
                <MenuItem
                  onSelect={() => {
                    void navigator.clipboard?.writeText(`${window.location.origin}${inboxHref({ c: c.id })}`).then(() => toast("Link copied", { icon: <Check className="size-4" /> }));
                  }}
                >
                  <Copy /> Copy link
                </MenuItem>
                {c.externalUrl || info.alternative ? (
                  <MenuItem asChild>
                    <a href={c.externalUrl ?? info.alternative!.url} target="_blank" rel="noreferrer">
                      <ExternalLink /> Open in {info.shortName}
                    </a>
                  </MenuItem>
                ) : null}
              </MenuContent>
            </Menu>
            <span className="mx-1 hidden h-5 w-px bg-line xl:block" />
            <IconButton label={panelOpen ? "Hide details" : "Show details"} shortcut="]" onClick={onTogglePanel} active={panelOpen} className="hidden xl:inline-flex">
              <PanelRight />
            </IconButton>
          </div>
        </PopoverAnchor>
        <PopoverContent align="end">
          <p className="mb-2 text-xs font-medium text-fg-2">Snooze until</p>
          <CustomDateTimeForm
            submitLabel="Snooze"
            onCancel={() => setCustomSnooze(false)}
            onSubmit={(d) => {
              actions.snooze(c, d, undefined, { onDone: afterRemove });
              setCustomSnooze(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </header>
  );
}
