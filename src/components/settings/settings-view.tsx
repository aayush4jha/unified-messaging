"use client";

import {
  Bell,
  Brain,
  Check,
  Download,
  Inbox,
  Keyboard,
  Monitor,
  Moon,
  MoreHorizontal,
  Palette,
  Pause,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Shield,
  Sun,
  Tag,
  Trash2,
  TriangleAlert,
  Unplug,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { decide, showDesktopNotification } from "@/lib/notify";
import { PLATFORMS, capabilitiesFor } from "@/lib/platforms";
import type { AccentName, Account, PriorityRule, QuickFilter } from "@/lib/types";
import { useServerStatus } from "@/lib/use-connectors";
import { cn, formatRelative, hueFromString, modKey } from "@/lib/utils";
import { useUI } from "@/store/ui";
import { useWorkspace, type Preferences } from "@/store/workspace";
import { IntegrationCatalog, startConnect, DemoCallout } from "../accounts/integration-catalog";
import { PlatformIcon } from "../brand/platform-icon";
import { PageHeader } from "../shell/page-header";
import { Button, IconButton } from "../ui/button";
import { Badge, Input, Segmented, Switch } from "../ui/controls";
import { confirm, Dialog, DialogBody, DialogContent } from "../ui/dialog";
import { Kbd } from "../ui/kbd";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/menu";

const TABS = [
  { id: "accounts", label: "Accounts", icon: Plug },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "priority", label: "Priority rules", icon: Zap },
  { id: "labels", label: "Labels", icon: Tag },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "privacy", label: "Privacy & data", icon: Shield },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function SettingsView() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "accounts") as TabId;
  const setTab = (t: TabId) => router.replace(`/settings?tab=${t}`, { scroll: false });

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <PageHeader title="Settings" description="Accounts, appearance, notifications and privacy" />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav aria-label="Settings sections" className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-line bg-surface px-3 py-2 scrollbar-none md:w-[220px] md:flex-col md:border-b-0 md:border-r md:px-2.5 md:py-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={cn(
                "flex h-8 shrink-0 items-center gap-2.5 rounded-sm px-2.5 text-[0.8125rem] text-fg-2 transition-colors hover:bg-hover hover:text-fg [&_svg]:size-4 [&_svg]:text-fg-3",
                tab === t.id && "bg-active font-medium text-fg [&_svg]:text-fg",
              )}
            >
              <t.icon /> {t.label}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto max-w-[760px] px-4 py-6 sm:px-8 sm:py-8">
            {tab === "accounts" ? <AccountsSection /> : null}
            {tab === "appearance" ? <AppearanceSection /> : null}
            {tab === "notifications" ? <NotificationsSection /> : null}
            {tab === "priority" ? <PrioritySection /> : null}
            {tab === "labels" ? <LabelsSection /> : null}
            {tab === "inbox" ? <InboxSection /> : null}
            {tab === "shortcuts" ? <ShortcutsSection /> : null}
            {tab === "privacy" ? <PrivacySection /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------------------------- */

function SectionTitle({ title, description, action }: { title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[1.0625rem] font-semibold tracking-[-0.015em]">{title}</h2>
        {description ? <p className="mt-1 text-[0.8125rem] leading-5 text-fg-3">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("overflow-hidden rounded-lg border border-line bg-surface shadow-xs", className)}>{children}</div>;
}

function SettingRow({ title, description, children, className }: { title: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 border-b border-line-subtle px-4 py-3.5 last:border-b-0", className)}>
      <div className="min-w-0 flex-1">
        <div className="text-[0.8125rem] font-medium text-fg">{title}</div>
        {description ? <div className="mt-0.5 text-xs leading-[1.125rem] text-fg-3">{description}</div> : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Accounts */

function AccountsSection() {
  const params = useSearchParams();
  const accounts = useWorkspace((s) => s.accounts);
  const mode = useWorkspace((s) => s.mode);
  const loadDemo = useWorkspace((s) => s.loadDemo);
  const resetWorkspace = useWorkspace((s) => s.resetWorkspace);
  const [connectOpen, setConnectOpen] = useState(params.get("connect") === "1");
  const reconnectId = params.get("reconnect");
  const platformFilter = params.get("platform");
  const shown = platformFilter ? accounts.filter((a) => a.platform === platformFilter) : accounts;

  const grouped = Array.from(new Set(shown.map((a) => a.platform))).map((p) => ({ platform: p, accounts: shown.filter((a) => a.platform === p) }));

  return (
    <>
      <SectionTitle
        title="Connected accounts"
        description="Orbit connects through each platform's official API. Passwords are never stored; tokens are encrypted and never reach your browser."
        action={
          <Button variant="primary" onClick={() => setConnectOpen(true)}>
            <Plus /> Connect account
          </Button>
        }
      />

      {mode === "demo" ? (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-[color-mix(in_oklch,var(--warning)_30%,transparent)] bg-warning-soft px-4 py-3 text-xs leading-[1.125rem] text-fg-2">
          <TriangleAlert className="mt-px size-4 shrink-0 text-warning" />
          <div className="flex-1">
            <p className="font-medium text-fg">These are sample accounts.</p>
            <p>They don&apos;t connect to any real service. Remove them whenever you&apos;re ready to use your own accounts.</p>
          </div>
          <Button
            size="xs"
            variant="secondary"
            onClick={async () => {
              if (await confirm({ title: "Remove sample workspace?", description: "All sample accounts, conversations and reminders will be deleted from this browser.", confirmLabel: "Remove sample data", danger: true })) {
                resetWorkspace();
                toast("Sample workspace removed");
              }
            }}
          >
            Remove sample data
          </Button>
        </div>
      ) : null}

      {accounts.length === 0 ? (
        <div className="space-y-4">
          <Card className="p-8 text-center">
            <Plug className="mx-auto size-6 text-fg-3" />
            <p className="mt-3 text-[0.875rem] font-medium">No accounts connected</p>
            <p className="mt-1 text-xs text-fg-3">Connect Gmail, Slack or a Telegram bot to start.</p>
            <Button className="mt-4" variant="primary" onClick={() => setConnectOpen(true)}>
              Browse integrations
            </Button>
          </Card>
          <DemoCallout onUse={() => (loadDemo(), toast("Sample workspace loaded"))} />
        </div>
      ) : (
        <div className="space-y-5">
          {platformFilter ? (
            <Link href="/settings?tab=accounts" className="text-xs font-medium text-accent-text hover:underline">
              ← All accounts
            </Link>
          ) : null}
          {grouped.map((g) => (
            <section key={g.platform}>
              <h3 className="mb-2 flex items-center gap-2 text-[0.8125rem] font-semibold">
                <PlatformIcon platform={g.platform} size={16} /> {PLATFORMS[g.platform].name}
                <span className="font-normal text-fg-4">{g.accounts.length}</span>
              </h3>
              <Card>
                {g.accounts.map((a) => (
                  <AccountRow key={a.id} account={a} highlight={reconnectId === a.id} />
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}

      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent title="Connect an account" description="Live connectors use official OAuth. Restricted platforms explain what their APIs allow." size="xl">
          <DialogBody className="pb-6">
            <IntegrationCatalog />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AccountRow({ account: a, highlight }: { account: Account; highlight?: boolean }) {
  const { updateAccount, removeAccount, setDefaultSender } = useWorkspace.getState();
  const info = PLATFORMS[a.platform];
  const caps = capabilitiesFor(a.platform, a.capabilityOverrides);
  const [label, setLabel] = useState(a.label);
  const [editing, setEditing] = useState(false);
  const needsAuth = a.status === "needs_reauth" || a.status === "error";
  const access = caps.send || caps.compose ? "Read & send" : caps.reply ? "Read & reply" : "Read only (preview)";

  const reconnect = () => {
    if (a.isDemo) {
      updateAccount(a.id, { status: "connected", statusMessage: undefined, lastSyncedAt: new Date().toISOString() });
      toast("Sample account marked as reconnected", { description: "Real accounts reconnect through the provider's OAuth screen." });
    } else startConnect(a.platform);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-subtle px-4 py-3.5 last:border-b-0", highlight && "bg-warning-soft/60")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (label.trim()) updateAccount(a.id, { label: label.trim() });
                setEditing(false);
              }}
            >
              <Input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus onBlur={() => (label.trim() && updateAccount(a.id, { label: label.trim() }), setEditing(false))} className="h-7 w-44" aria-label="Account name" />
            </form>
          ) : (
            <button className="text-[0.875rem] font-semibold hover:underline" onClick={() => setEditing(true)} title="Rename">
              {a.label}
            </button>
          )}
          {a.isDefaultSender ? <Badge tone="accent">Default sender</Badge> : null}
          {a.isDemo ? <Badge tone="warning">Sample</Badge> : null}
          {needsAuth ? (
            <Badge tone="warning">
              <TriangleAlert /> Needs reconnect
            </Badge>
          ) : a.status === "paused" ? (
            <Badge tone="neutral">
              <Pause /> Sync paused
            </Badge>
          ) : (
            <Badge tone="success">
              <Check /> Connected
            </Badge>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-fg-3">
          {a.handle} · {access} · {a.lastSyncedAt ? `synced ${formatRelative(a.lastSyncedAt)}` : "never synced"}
        </div>
        {a.statusMessage ? <div className="mt-1 text-xs text-fg-3">{a.statusMessage}</div> : null}
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-fg-3" title="Allow AI features to read this account">
          <Brain className="size-3.5" /> AI
          <Switch checked={a.aiEnabled} onCheckedChange={(v) => updateAccount(a.id, { aiEnabled: v })} aria-label={`AI access for ${a.label}`} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-fg-3" title="Notifications from this account">
          <Bell className="size-3.5" />
          <Switch checked={a.notificationsEnabled} onCheckedChange={(v) => updateAccount(a.id, { notificationsEnabled: v })} aria-label={`Notifications for ${a.label}`} />
        </label>
        {needsAuth ? (
          <Button size="sm" variant="primary" onClick={reconnect}>
            <RefreshCw /> {a.isDemo ? "Simulate reconnect" : "Reconnect"}
          </Button>
        ) : null}
        <Menu>
          <MenuTrigger asChild>
            <IconButton label={`${a.label} options`}>
              <MoreHorizontal />
            </IconButton>
          </MenuTrigger>
          <MenuContent align="end" className="w-60">
            {caps.compose && !a.isDefaultSender ? (
              <MenuItem onSelect={() => (setDefaultSender(a.id), toast(`${a.label} is now the default ${info.name} sender`))}>
                <Check /> Set as default sender
              </MenuItem>
            ) : null}
            <MenuItem onSelect={() => setEditing(true)}>
              <Tag /> Rename
            </MenuItem>
            <MenuItem
              onSelect={() => {
                updateAccount(a.id, { status: a.status === "paused" ? "connected" : "paused" });
                toast(a.status === "paused" ? "Sync resumed" : "Sync paused");
              }}
            >
              {a.status === "paused" ? <Play /> : <Pause />} {a.status === "paused" ? "Resume sync" : "Pause sync"}
            </MenuItem>
            {!a.isDemo ? (
              <MenuItem onSelect={() => startConnect(a.platform)}>
                <RefreshCw /> Reconnect / update permissions
              </MenuItem>
            ) : null}
            <MenuSeparator />
            <MenuItem
              danger
              onSelect={async () => {
                const ok = await confirm({
                  title: `Disconnect ${info.name} · ${a.label}?`,
                  description: (
                    <>
                      Orbit will revoke its access and permanently delete every conversation, message, note and reminder synced from <b>{a.handle}</b>. Your data on {info.name} isn&apos;t affected.
                    </>
                  ),
                  confirmLabel: "Disconnect & delete data",
                  danger: true,
                });
                if (!ok) return;
                if (!a.isDemo) await fetch(`/api/accounts/${a.id}`, { method: "DELETE" }).catch(() => null);
                removeAccount(a.id);
                toast(`${a.label} disconnected`, { description: "All of its synced data was deleted." });
              }}
            >
              <Unplug /> Disconnect & delete data
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Appearance */

const ACCENTS: { id: AccentName; label: string; swatch: string }[] = [
  { id: "vermilion", label: "Vermilion", swatch: "oklch(0.6 0.185 33)" },
  { id: "moss", label: "Moss", swatch: "oklch(0.55 0.11 158)" },
  { id: "cobalt", label: "Cobalt", swatch: "oklch(0.55 0.15 258)" },
  { id: "amber", label: "Amber", swatch: "oklch(0.72 0.15 65)" },
  { id: "graphite", label: "Graphite", swatch: "oklch(0.32 0.006 80)" },
];

function AppearanceSection() {
  const prefs = useWorkspace((s) => s.prefs);
  const setPrefs = useWorkspace((s) => s.setPrefs);
  return (
    <>
      <SectionTitle title="Appearance" description="Orbit adapts to light and dark. Every accent is tuned separately for each theme." />
      <h3 className="mb-2 text-xs font-medium text-fg-2">Theme</h3>
      <div className="grid grid-cols-3 gap-3">
        {(
          [
            { id: "light", label: "Light", icon: Sun },
            { id: "dark", label: "Dark", icon: Moon },
            { id: "system", label: "System", icon: Monitor },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setPrefs({ theme: t.id })}
            aria-pressed={prefs.theme === t.id}
            className={cn("overflow-hidden rounded-lg border text-left transition-[border-color,box-shadow]", prefs.theme === t.id ? "border-accent ring-3 ring-accent-soft" : "border-line hover:border-line-strong")}
          >
            <ThemePreview kind={t.id} />
            <div className="flex items-center gap-2 border-t border-line-subtle bg-surface px-3 py-2 text-[0.8125rem] font-medium">
              <t.icon className="size-3.5 text-fg-3" /> {t.label}
              {prefs.theme === t.id ? <Check className="ml-auto size-3.5 text-accent-text" /> : null}
            </div>
          </button>
        ))}
      </div>

      <h3 className="mb-2 mt-7 text-xs font-medium text-fg-2">Accent color</h3>
      <div className="flex flex-wrap gap-2">
        {ACCENTS.map((a) => (
          <button
            key={a.id}
            onClick={() => setPrefs({ accent: a.id })}
            aria-pressed={prefs.accent === a.id}
            className={cn("inline-flex h-9 items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-[0.8125rem] transition-colors", prefs.accent === a.id ? "border-fg font-medium" : "border-line hover:border-line-strong")}
          >
            <span className="inline-flex size-6 items-center justify-center rounded-full" style={{ background: a.swatch }}>
              {prefs.accent === a.id ? <Check className="size-3.5 text-white" /> : null}
            </span>
            {a.label}
          </button>
        ))}
      </div>

      <h3 className="mb-2 mt-7 text-xs font-medium text-fg-2">Density</h3>
      <Card>
        <SettingRow title="List density" description="Compact fits more conversations on screen; comfortable gives each row more air.">
          <Segmented
            value={prefs.density}
            onChange={(v) => setPrefs({ density: v })}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
            ariaLabel="Density"
          />
        </SettingRow>
      </Card>
    </>
  );
}

function ThemePreview({ kind }: { kind: "light" | "dark" | "system" }) {
  const pane = (dark: boolean) => (
    <div className={cn("flex h-full flex-1 gap-1.5 p-2", dark ? "bg-[#1b1a19]" : "bg-[#faf9f7]")}>
      <div className={cn("w-1/4 space-y-1 rounded-[4px] p-1", dark ? "bg-[#161514]" : "bg-[#f1f0ec]")}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn("h-1.5 rounded-full", dark ? "bg-[#33312f]" : "bg-[#dedcd6]")} />
        ))}
      </div>
      <div className="flex-1 space-y-1.5 pt-0.5">
        <div className="h-1.5 w-2/3 rounded-full bg-accent" />
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn("h-1.5 rounded-full", dark ? "bg-[#33312f]" : "bg-[#e5e3de]")} style={{ width: `${90 - i * 15}%` }} />
        ))}
      </div>
    </div>
  );
  return <div className="flex h-20">{kind === "system" ? (<>{pane(false)}{pane(true)}</>) : pane(kind === "dark")}</div>;
}

/* ------------------------------------------------------------------ Notifications */

function NotificationsSection() {
  const prefs = useWorkspace((s) => s.prefs);
  const setPrefs = useWorkspace((s) => s.setPrefs);
  const accounts = useWorkspace((s) => s.accounts);
  const updateAccount = useWorkspace((s) => s.updateAccount);
  const pushNotification = useWorkspace((s) => s.pushNotification);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  const sendTest = async () => {
    const account = accounts.find((a) => a.notificationsEnabled) ?? accounts[0];
    const d = decide({ kind: "message" }, { prefs, account });
    if (!d.deliver) {
      toast("Test notification suppressed", { description: d.reason });
      return;
    }
    pushNotification({ kind: "message", title: "Test notification", body: "This is how new messages will reach you.", accountId: account?.id });
    if (!d.interrupt) {
      toast("Delivered silently to the notification center", { description: d.reason });
      return;
    }
    const shown = prefs.desktopNotifications && (await showDesktopNotification("Orbit · Test notification", "This is how new messages will reach you."));
    toast("Test notification", { description: shown ? "Also shown as a desktop notification." : "Shown in Orbit. Turn on desktop notifications to get them outside the app." });
  };

  return (
    <>
      <SectionTitle title="Notifications" description="Decide what can interrupt you. Everything is still collected in the notification center." action={<Button onClick={sendTest}>Send test notification</Button>} />
      <Card>
        <SettingRow title="Do Not Disturb" description="Silence all interruptions until you turn it off.">
          <Switch checked={prefs.doNotDisturb} onCheckedChange={(v) => setPrefs({ doNotDisturb: v })} aria-label="Do Not Disturb" />
        </SettingRow>
        <SettingRow title="Only priority interrupts" description="Normal messages arrive silently; VIPs, mentions, deadlines and reminders still notify.">
          <Switch checked={prefs.priorityOnlyNotifications} onCheckedChange={(v) => setPrefs({ priorityOnlyNotifications: v })} aria-label="Only priority interrupts" />
        </SettingRow>
        <SettingRow
          title="Quiet hours"
          description={
            prefs.quietHours.enabled ? (
              <span className="mt-1.5 flex items-center gap-2">
                <Input type="time" value={prefs.quietHours.start} onChange={(e) => setPrefs({ quietHours: { ...prefs.quietHours, start: e.target.value } })} className="h-7 w-28" aria-label="Quiet hours start" />
                to
                <Input type="time" value={prefs.quietHours.end} onChange={(e) => setPrefs({ quietHours: { ...prefs.quietHours, end: e.target.value } })} className="h-7 w-28" aria-label="Quiet hours end" />
              </span>
            ) : (
              "Hold non-priority notifications overnight."
            )
          }
        >
          <Switch checked={prefs.quietHours.enabled} onCheckedChange={(v) => setPrefs({ quietHours: { ...prefs.quietHours, enabled: v } })} aria-label="Quiet hours" />
        </SettingRow>
        <SettingRow
          title="Desktop notifications"
          description={permission === "denied" ? "Blocked by your browser. Allow notifications for this site in browser settings." : permission === "unsupported" ? "This browser doesn't support notifications." : "Show system notifications when Orbit is in the background."}
        >
          <Switch
            checked={prefs.desktopNotifications && permission === "granted"}
            disabled={permission === "denied" || permission === "unsupported"}
            onCheckedChange={async (v) => {
              if (!v) return setPrefs({ desktopNotifications: false });
              const p = await Notification.requestPermission();
              setPermission(p);
              setPrefs({ desktopNotifications: p === "granted" });
              if (p !== "granted") toast("Permission not granted");
            }}
            aria-label="Desktop notifications"
          />
        </SettingRow>
      </Card>

      <h3 className="mb-2 mt-7 text-xs font-medium text-fg-2">Per account</h3>
      <Card>
        {accounts.length === 0 ? <SettingRow title="No accounts yet" /> : null}
        {accounts.map((a) => (
          <SettingRow
            key={a.id}
            title={
              <span className="flex items-center gap-2">
                <PlatformIcon platform={a.platform} size={14} /> {PLATFORMS[a.platform].shortName} · {a.label}
              </span>
            }
            description={a.handle}
          >
            <Switch checked={a.notificationsEnabled} onCheckedChange={(v) => updateAccount(a.id, { notificationsEnabled: v })} aria-label={`Notifications for ${a.label}`} />
          </SettingRow>
        ))}
      </Card>
      <p className="mt-3 text-xs text-fg-3">
        Mute individual conversations from their ⋯ menu. Priority is decided by your <Link className="font-medium text-accent-text hover:underline" href="/settings?tab=priority">priority rules</Link>.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ Priority */

function PrioritySection() {
  const rules = useWorkspace((s) => s.priorityRules);
  const contacts = useWorkspace((s) => s.contacts);
  const { addRule, updateRule, deleteRule } = useWorkspace.getState();
  const [kind, setKind] = useState<PriorityRule["kind"]>("keyword");
  const [value, setValue] = useState("");
  const [effect, setEffect] = useState<PriorityRule["effect"]>("boost");
  const vips = contacts.filter((c) => c.vip);

  return (
    <>
      <SectionTitle
        title="Priority rules"
        description="Orbit scores every conversation with transparent signals (VIP senders, mentions, deadlines, direct questions, automated mail). Add your own rules on top. Hover the ⚡ on any conversation to see why it ranked."
      />
      <Card>
        <form
          className="flex flex-wrap items-center gap-2 border-b border-line-subtle bg-surface-sunken/60 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!value.trim()) return;
            addRule({ kind, value: value.trim(), effect, enabled: true });
            setValue("");
            toast("Rule added");
          }}
        >
          <Segmented
            size="xs"
            value={effect}
            onChange={setEffect}
            options={[
              { value: "boost", label: "Boost" },
              { value: "lower", label: "Lower" },
            ]}
            ariaLabel="Effect"
          />
          <span className="text-xs text-fg-3">when</span>
          <Segmented
            size="xs"
            value={kind}
            onChange={setKind}
            options={[
              { value: "keyword", label: "Keyword" },
              { value: "sender", label: "Sender" },
              { value: "platform", label: "Platform" },
            ]}
            ariaLabel="Rule type"
          />
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "keyword" ? "e.g. invoice" : kind === "sender" ? "Name or email" : "e.g. slack"} className="h-7 w-44 flex-1" aria-label="Rule value" />
          <Button type="submit" size="sm" variant="primary" disabled={!value.trim()}>
            Add rule
          </Button>
        </form>
        {rules.length === 0 ? <SettingRow title="No custom rules" description="Built-in signals still apply." /> : null}
        {rules.map((r) => (
          <SettingRow
            key={r.id}
            title={
              <span className="flex items-center gap-2">
                <Badge tone={r.effect === "boost" ? "accent" : "neutral"}>{r.effect === "boost" ? "Boost" : "Lower"}</Badge>
                {r.kind === "keyword" ? "Mentions" : r.kind === "sender" ? "From" : "On"} <span className="font-semibold">“{r.value}”</span>
              </span>
            }
          >
            <div className="flex items-center gap-2">
              <Switch checked={r.enabled} onCheckedChange={(v) => updateRule(r.id, { enabled: v })} aria-label="Enabled" />
              <IconButton size="xs" label="Delete rule" onClick={() => deleteRule(r.id)}>
                <Trash2 />
              </IconButton>
            </div>
          </SettingRow>
        ))}
      </Card>

      <h3 className="mb-2 mt-7 text-xs font-medium text-fg-2">VIP contacts · always high priority</h3>
      <Card>
        {vips.length === 0 ? <SettingRow title="No VIPs yet" description="Mark people as VIP from their contact card." /> : null}
        {vips.map((c) => (
          <SettingRow key={c.id} title={c.name} description={[c.title, c.company].filter(Boolean).join(" · ")}>
            <Button size="xs" variant="ghost" asChild>
              <Link href={`/contacts?id=${c.id}`}>Open</Link>
            </Button>
          </SettingRow>
        ))}
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ Labels */

function LabelsSection() {
  const labels = useWorkspace((s) => s.labels);
  const conversations = useWorkspace((s) => s.conversations);
  const { addLabel, deleteLabel } = useWorkspace.getState();
  const [name, setName] = useState("");
  return (
    <>
      <SectionTitle title="Labels" description="Organize conversations across every platform. Labels are private to Orbit and never synced back to providers." />
      <Card>
        <form
          className="flex gap-2 border-b border-line-subtle bg-surface-sunken/60 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n) return;
            if (labels.some((l) => l.name.toLowerCase() === n.toLowerCase())) return toast.error("A label with that name exists");
            addLabel(n, hueFromString(n));
            setName("");
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New label name" aria-label="New label name" className="h-8" />
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Create
          </Button>
        </form>
        {labels.length === 0 ? <SettingRow title="No labels yet" /> : null}
        {labels.map((l) => {
          const count = conversations.filter((c) => c.labels.includes(l.id)).length;
          return (
            <SettingRow
              key={l.id}
              title={
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: `oklch(0.65 0.13 ${l.hue})` }} /> {l.name}
                </span>
              }
              description={`${count} conversation${count === 1 ? "" : "s"}`}
            >
              <IconButton
                size="xs"
                label={`Delete ${l.name}`}
                onClick={async () => {
                  if (await confirm({ title: `Delete “${l.name}”?`, description: "The label is removed from all conversations. Conversations themselves aren't deleted.", confirmLabel: "Delete label", danger: true })) deleteLabel(l.id);
                }}
              >
                <Trash2 />
              </IconButton>
            </SettingRow>
          );
        })}
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ Inbox */

function InboxSection() {
  const prefs = useWorkspace((s) => s.prefs);
  const setPrefs = useWorkspace((s) => s.setPrefs);
  const accounts = useWorkspace((s) => s.accounts);
  const setDefaultSender = useWorkspace((s) => s.setDefaultSender);
  const senders = accounts.filter((a) => capabilitiesFor(a.platform, a.capabilityOverrides).compose);
  const defaultFor = (p: string) => senders.find((a) => a.platform === p && a.isDefaultSender)?.id ?? "";
  return (
    <>
      <SectionTitle title="Inbox" description="Defaults for how conversations are organized and sent." />
      <Card>
        <SettingRow title="Default filter" description="The filter applied when you open the inbox.">
          <select
            value={prefs.defaultFilter}
            onChange={(e) => setPrefs({ defaultFilter: e.target.value as QuickFilter })}
            className="h-8 rounded-sm border border-line bg-surface px-2 text-[0.8125rem]"
            aria-label="Default filter"
          >
            {["all", "unread", "starred", "priority", "personal", "professional", "work"].map((f) => (
              <option key={f} value={f}>
                {f[0].toUpperCase() + f.slice(1)}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow title="Show details panel" description="Contact, notes and follow-ups beside each conversation (wide screens).">
          <Switch checked={prefs.contactPanelOpen} onCheckedChange={(v) => setPrefs({ contactPanelOpen: v })} aria-label="Details panel" />
        </SettingRow>
        <SettingRow title="Collapse sidebar" description={`Use the icon rail. Toggle anytime with ${modKey()} \\.`}>
          <Switch checked={prefs.sidebarCollapsed} onCheckedChange={(v) => setPrefs({ sidebarCollapsed: v })} aria-label="Collapse sidebar" />
        </SettingRow>
      </Card>
      <h3 className="mb-2 mt-7 text-xs font-medium text-fg-2">Sending</h3>
      <Card>
        <SettingRow title="Send shortcut in chats" description="Email always uses the modifier shortcut, so you never send a half-written email.">
          <Segmented
            value={prefs.sendShortcut}
            onChange={(v) => setPrefs({ sendShortcut: v })}
            options={[
              { value: "mod-enter", label: `${modKey()} ↵` },
              { value: "enter", label: "↵" },
            ]}
            ariaLabel="Send shortcut"
          />
        </SettingRow>
        <SettingRow title="Undo send window" description="Hold messages briefly so you can take them back.">
          <Segmented
            value={String(prefs.undoSendSeconds) as "0" | "5" | "10" | "20"}
            onChange={(v) => setPrefs({ undoSendSeconds: Number(v) })}
            options={[
              { value: "0", label: "Off" },
              { value: "5", label: "5s" },
              { value: "10", label: "10s" },
              { value: "20", label: "20s" },
            ]}
            ariaLabel="Undo send"
          />
        </SettingRow>
        {Array.from(new Set(senders.map((a) => a.platform))).map((p) => {
          const options = senders.filter((a) => a.platform === p);
          if (options.length < 2) return null;
          return (
            <SettingRow key={p} title={`Default ${PLATFORMS[p].name} sender`} description="Used for new messages unless you pick another account.">
              <select value={defaultFor(p)} onChange={(e) => setDefaultSender(e.target.value)} className="h-8 max-w-[220px] rounded-sm border border-line bg-surface px-2 text-[0.8125rem]" aria-label={`Default ${PLATFORMS[p].name} sender`}>
                <option value="" disabled>
                  Choose…
                </option>
                {options.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} ({a.handle})
                  </option>
                ))}
              </select>
            </SettingRow>
          );
        })}
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ Shortcuts */

function ShortcutsSection() {
  const setShortcuts = useUI((s) => s.setShortcuts);
  const rows: [string, string][] = [
    [`${modKey()} K`, "Command palette & search"],
    ["C", "Compose"],
    ["J / K", "Next / previous conversation"],
    ["R", "Reply"],
    ["E", "Archive"],
    ["S", "Star"],
    ["U", "Toggle read"],
    ["H", "Snooze"],
    ["M", "Reminder"],
    ["G then I/U/S/D/E/T", "Go to a folder"],
  ];
  return (
    <>
      <SectionTitle title="Keyboard shortcuts" description="Orbit is designed to be driven from the keyboard." action={<Button onClick={() => setShortcuts(true)}>Show all</Button>} />
      <Card>
        {rows.map(([k, l]) => (
          <SettingRow key={l} title={l}>
            <Kbd>{k}</Kbd>
          </SettingRow>
        ))}
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ Privacy */

function PrivacySection() {
  const router = useRouter();
  const prefs = useWorkspace((s) => s.prefs);
  const setPrefs = useWorkspace((s) => s.setPrefs);
  const accounts = useWorkspace((s) => s.accounts);
  const updateAccount = useWorkspace((s) => s.updateAccount);
  const resetWorkspace = useWorkspace((s) => s.resetWorkspace);
  const { status } = useServerStatus();

  const exportData = () => {
    const s = useWorkspace.getState();
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), accounts: s.accounts.map(({ ...a }) => a), contacts: s.contacts, conversations: s.conversations, messages: s.messages, reminders: s.reminders, notes: s.notes, labels: s.labels, preferences: s.prefs }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orbit-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Export downloaded");
  };

  return (
    <>
      <SectionTitle title="Privacy & data" description="You decide what Orbit stores and what AI can read." />
      <Card>
        <SettingRow
          title="AI features"
          description={
            status && !status.backend.ai
              ? "AI isn't configured on this deployment (no ANTHROPIC_API_KEY). Rule-based briefings and suggestions still work."
              : "Summaries, smart replies and the assistant. Conversations are processed on request and never used for training."
          }
        >
          <Switch checked={prefs.aiEnabled} onCheckedChange={(v) => setPrefs({ aiEnabled: v })} aria-label="AI features" />
        </SettingRow>
        <SettingRow title="Smart reply suggestions" description="Suggestions are drafts you edit. Orbit never sends on its own.">
          <Switch checked={prefs.smartReplies} disabled={!prefs.aiEnabled} onCheckedChange={(v) => setPrefs({ smartReplies: v })} aria-label="Smart replies" />
        </SettingRow>
        <SettingRow title="Data retention" description="Synced message bodies older than this are deleted from Orbit's database. Your provider keeps the originals.">
          <select value={prefs.retentionDays} onChange={(e) => setPrefs({ retentionDays: Number(e.target.value) })} className="h-8 rounded-sm border border-line bg-surface px-2 text-[0.8125rem]" aria-label="Retention">
            {[30, 90, 180, 365].map((d) => (
              <option key={d} value={d}>
                {d === 365 ? "1 year" : `${d} days`}
              </option>
            ))}
          </select>
        </SettingRow>
      </Card>

      <h3 className="mb-2 mt-7 text-xs font-medium text-fg-2">AI access by account</h3>
      <Card>
        {accounts.length === 0 ? <SettingRow title="No accounts yet" /> : null}
        {accounts.map((a) => (
          <SettingRow
            key={a.id}
            title={
              <span className="flex items-center gap-2">
                <PlatformIcon platform={a.platform} size={14} /> {PLATFORMS[a.platform].shortName} · {a.label}
              </span>
            }
            description={`Permissions: ${PLATFORMS[a.platform].authMethod}`}
          >
            <Switch checked={a.aiEnabled} disabled={!prefs.aiEnabled} onCheckedChange={(v) => updateAccount(a.id, { aiEnabled: v })} aria-label={`AI access for ${a.label}`} />
          </SettingRow>
        ))}
      </Card>

      <h3 className="mb-2 mt-7 text-xs font-medium text-fg-2">Your data</h3>
      <Card>
        <SettingRow title="Export" description="Download everything Orbit holds in this workspace as JSON.">
          <Button size="sm" onClick={exportData}>
            <Download /> Export
          </Button>
        </SettingRow>
        <SettingRow title="Delete workspace data" description="Removes all accounts, conversations, notes and reminders from this browser and signs out of sample mode.">
          <Button
            size="sm"
            variant="danger-ghost"
            onClick={async () => {
              if (await confirm({ title: "Delete all workspace data?", description: "This can't be undone. Connected providers aren't affected.", confirmLabel: "Delete everything", danger: true })) {
                resetWorkspace();
                setPrefs({ onboarded: false });
                toast("Workspace data deleted");
                router.replace("/onboarding");
              }
            }}
          >
            <Trash2 /> Delete
          </Button>
        </SettingRow>
      </Card>
    </>
  );
}

export type { Preferences };
