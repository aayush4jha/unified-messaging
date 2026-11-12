"use client";

import { ArrowUpRight, Check, ChevronDown, ExternalLink, KeyRound, Lock, Plug, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CATEGORY_LABEL, PLATFORMS, PLATFORM_ORDER, type PlatformInfo } from "@/lib/platforms";
import type { PlatformCategory, PlatformId } from "@/lib/types";
import { useServerStatus, type ConnectorStatus } from "@/lib/use-connectors";
import { cn } from "@/lib/utils";
import { PlatformIcon } from "../brand/platform-icon";
import { Button } from "../ui/button";
import { Badge, Input } from "../ui/controls";

const CATEGORIES: PlatformCategory[] = ["email", "professional", "messaging", "social"];

export function SupportBadge({ info, status }: { info: PlatformInfo; status?: ConnectorStatus }) {
  if (info.support === "live")
    return status?.configured ? (
      <Badge tone="success">
        <Check /> Available
      </Badge>
    ) : (
      <Badge tone="warning">
        <KeyRound /> Setup required
      </Badge>
    );
  if (info.support === "planned") return <Badge tone="info">Planned</Badge>;
  return (
    <Badge tone="neutral">
      <Lock /> Restricted
    </Badge>
  );
}

/** Starts the real connection flow for a live, configured connector. */
export function startConnect(platform: PlatformId) {
  // Full-page navigation on purpose: this route handler redirects to the provider's OAuth consent screen.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `/api/connectors/${platform}/start`;
}

export function IntegrationCatalog({
  selectable,
  selected,
  onToggle,
  compact,
}: {
  selectable?: boolean;
  selected?: PlatformId[];
  onToggle?: (p: PlatformId) => void;
  compact?: boolean;
}) {
  const { status, loading } = useServerStatus();
  const [open, setOpen] = useState<PlatformId | null>(null);
  return (
    <div className="space-y-6">
      {CATEGORIES.map((cat) => {
        const items = PLATFORM_ORDER.filter((p) => PLATFORMS[p].category === cat);
        return (
          <section key={cat}>
            <h3 className="mb-2 text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-fg-4">{CATEGORY_LABEL[cat]}</h3>
            <div className={cn("grid gap-2", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
              {items.map((p) => {
                const info = PLATFORMS[p];
                const st = status?.connectors.find((c) => c.platform === p);
                const isSel = selected?.includes(p);
                return (
                  <div
                    key={p}
                    className={cn(
                      "group relative rounded-lg border bg-surface p-3.5 shadow-xs transition-[border-color,box-shadow]",
                      selectable && isSel ? "border-accent ring-3 ring-accent-soft" : "border-line hover:border-line-strong",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <PlatformIcon platform={p} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[0.875rem] font-semibold">{info.name}</span>
                        </div>
                        <div className="mt-1">{loading ? <span className="skeleton inline-block h-[18px] w-20 rounded-[4px]" /> : <SupportBadge info={info} status={st} />}</div>
                      </div>
                      {selectable ? (
                        <button
                          aria-label={isSel ? `Deselect ${info.name}` : `Select ${info.name}`}
                          aria-pressed={isSel}
                          onClick={() => onToggle?.(p)}
                          className={cn(
                            "absolute inset-0 rounded-lg",
                            "after:absolute after:right-3 after:top-3 after:flex after:size-5 after:items-center after:justify-center after:rounded-full after:border-2 after:content-['']",
                            isSel ? "after:border-accent after:bg-accent" : "after:border-line-strong",
                          )}
                        />
                      ) : null}
                      {selectable && isSel ? <Check className="pointer-events-none absolute right-[15px] top-[15px] size-3 text-accent-contrast" /> : null}
                    </div>
                    <p className="mt-2.5 text-xs leading-[1.125rem] text-fg-3">{info.summary}</p>

                    {!selectable ? (
                      <div className="mt-3">
                        <ConnectAction info={info} status={st} expanded={open === p} onExpand={() => setOpen(open === p ? null : p)} />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function ConnectAction({ info, status, expanded, onExpand }: { info: PlatformInfo; status?: ConnectorStatus; expanded: boolean; onExpand: () => void }) {
  if (info.support === "live" && status?.configured) {
    if (info.id === "telegram") return <TelegramConnect />;
    if (info.id === "whatsapp") return <WhatsAppConnect />;
    return (
      <Button size="sm" variant="primary" onClick={() => startConnect(info.id)}>
        <Plug /> Connect {info.multiAccount ? "account" : ""}
      </Button>
    );
  }
  return (
    <div>
      <button onClick={onExpand} className="inline-flex items-center gap-1 text-xs font-medium text-fg-2 hover:text-fg" aria-expanded={expanded}>
        {info.support === "live" ? "How to enable" : info.support === "planned" ? "Details" : "Why it's limited"}
        <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded ? (
        <div className="mt-2 space-y-2 rounded-md bg-surface-sunken p-2.5 text-xs leading-[1.125rem] text-fg-2 animate-fade-in">
          {info.support === "live" ? (
            <>
              <p>
                The {info.name} connector is built, but this deployment is missing credentials. Add these server environment variables, then restart:
              </p>
              <ul className="space-y-0.5 font-mono text-[0.6875rem] text-fg">
                {(status?.missingEnv.length ? Array.from(new Set(status.missingEnv)) : info.requiredEnv).map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
              <p className="text-fg-3">Setup steps are in docs/INTEGRATIONS.md and .env.example.</p>
            </>
          ) : null}
          {info.limitation ? <p>{info.limitation}</p> : null}
          <p className="text-fg-3">Auth: {info.authMethod}</p>
          <div className="flex flex-wrap gap-3">
            {info.alternative ? (
              <a href={info.alternative.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
                {info.alternative.label} <ExternalLink className="size-3" />
              </a>
            ) : null}
            <a href={info.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-fg-3 hover:text-fg">
              API docs <ArrowUpRight className="size-3" />
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TelegramConnect() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(token.trim());
  return (
    <form
      className="flex gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        try {
          const r = await fetch("/api/connectors/telegram/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: token.trim() }) });
          const d = await r.json().catch(() => ({}));
          if (r.ok) {
            toast.success(`Connected @${d.username}`, { description: "New messages to your bot will appear in your inbox." });
            setToken("");
            router.push("/inbox");
          } else toast.error("Couldn't connect bot", { description: d.error ?? `Error ${r.status}` });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Bot token from @BotFather" aria-label="Telegram bot token" className="h-7 font-mono text-xs" type="password" autoComplete="off" />
      <Button size="sm" variant="primary" disabled={!valid} loading={busy} type="submit">
        Connect
      </Button>
    </form>
  );
}

function WhatsAppConnect() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [phoneId, setPhoneId] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = token.trim().length > 20 && /^\d{6,20}$/.test(phoneId.trim());
  return (
    <form
      className="space-y-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        try {
          const r = await fetch("/api/connectors/whatsapp/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: token.trim(), phoneNumberId: phoneId.trim() }) });
          const d = await r.json().catch(() => ({}));
          if (r.ok) {
            toast.success(`Connected ${d.handle}`, { description: "New WhatsApp messages will appear in your inbox." });
            router.push("/inbox");
          } else toast.error("Couldn't connect WhatsApp", { description: d.error ?? `Error ${r.status}` });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input value={phoneId} onChange={(e) => setPhoneId(e.target.value)} placeholder="Phone number ID" aria-label="WhatsApp phone number ID" className="h-7 font-mono text-xs" inputMode="numeric" />
      <div className="flex gap-1.5">
        <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="System-user access token" aria-label="WhatsApp access token" className="h-7 font-mono text-xs" type="password" autoComplete="off" />
        <Button size="sm" variant="primary" disabled={!valid} loading={busy} type="submit">
          Connect
        </Button>
      </div>
    </form>
  );
}

export function DemoCallout({ onUse }: { onUse: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-line-strong bg-surface-sunken p-4">
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-accent-soft text-accent-text">
        <Sparkles className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] font-medium">Not ready to connect? Explore a sample workspace</p>
        <p className="mt-0.5 text-xs leading-[1.125rem] text-fg-3">
          12 sample accounts with realistic conversations, all clearly labeled. Everything works. Sends are simulated and nothing leaves your browser.
        </p>
      </div>
      <Button size="sm" onClick={onUse}>
        Load sample data
      </Button>
    </div>
  );
}
