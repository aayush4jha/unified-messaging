"use client";

import { ArrowLeft, ArrowRight, Check, Monitor, Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PLATFORMS } from "@/lib/platforms";
import type { PlatformId, QuickFilter } from "@/lib/types";
import { useServerStatus } from "@/lib/use-connectors";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/store/workspace";
import { ConnectAction, DemoCallout, IntegrationCatalog, SupportBadge } from "../accounts/integration-catalog";
import { OrbitLogo, OrbitMark, PlatformIcon } from "../brand/platform-icon";
import { Button } from "../ui/button";
import { Segmented, Switch } from "../ui/controls";

const STEPS = ["Welcome", "Platforms", "Connect", "Preferences", "Ready"] as const;

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [platforms, setPlatforms] = useState<PlatformId[]>(["gmail", "slack"]);
  const prefs = useWorkspace((s) => s.prefs);
  const setPrefs = useWorkspace((s) => s.setPrefs);
  const loadDemo = useWorkspace((s) => s.loadDemo);
  const mode = useWorkspace((s) => s.mode);
  const accounts = useWorkspace((s) => s.accounts);

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
  };
  const finish = () => {
    setPrefs({ onboarded: true });
    router.replace("/inbox");
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex h-16 shrink-0 items-center justify-between px-5 sm:px-8">
        <OrbitLogo />
        <ol className="hidden items-center gap-1.5 sm:flex" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors",
                  i === step ? "bg-fg text-fg-inverse" : i < step ? "text-fg-2" : "text-fg-4",
                )}
                aria-current={i === step ? "step" : undefined}
              >
                {i < step ? <Check className="size-3" /> : null}
                {s}
              </span>
              {i < STEPS.length - 1 ? <span className="h-px w-3 bg-line-strong" /> : null}
            </li>
          ))}
        </ol>
        {step < 4 ? (
          <button className="text-xs font-medium text-fg-3 hover:text-fg" onClick={() => go(4)}>
            Skip setup
          </button>
        ) : (
          <span />
        )}
      </header>

      <main className="flex flex-1 items-start justify-center overflow-y-auto px-5 pb-16 pt-6 sm:pt-12">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -24 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[880px]"
          >
            {step === 0 ? <Welcome onNext={() => go(1)} /> : null}
            {step === 1 ? (
              <ChoosePlatforms selected={platforms} onToggle={(p) => setPlatforms((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]))} onBack={() => go(0)} onNext={() => go(2)} />
            ) : null}
            {step === 2 ? (
              <Connect
                platforms={platforms}
                onBack={() => go(1)}
                onNext={() => go(3)}
                onDemo={() => {
                  loadDemo();
                  toast("Sample workspace loaded", { description: "Everything is labeled as sample data." });
                  go(3);
                }}
                demoLoaded={mode === "demo"}
              />
            ) : null}
            {step === 3 ? <Preferences prefs={prefs} setPrefs={setPrefs} onBack={() => go(2)} onNext={() => go(4)} /> : null}
            {step === 4 ? <Ready accounts={accounts.length} demo={mode === "demo"} usage={prefs.usage} onFinish={finish} onDemo={() => (loadDemo(), finish())} /> : null}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function Nav({ onBack, onNext, nextLabel = "Continue", nextDisabled }: { onBack?: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean }) {
  return (
    <div className="mt-10 flex items-center justify-between">
      {onBack ? (
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
      ) : (
        <span />
      )}
      <Button variant="primary" size="lg" onClick={onNext} disabled={nextDisabled}>
        {nextLabel} <ArrowRight />
      </Button>
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  const lanes: PlatformId[] = ["gmail", "slack", "whatsapp", "telegram", "linkedin", "instagram", "outlook", "discord"];
  return (
    <div className="mx-auto max-w-[620px] pt-6 text-center">
      <div className="relative mx-auto mb-10 h-[180px] w-[180px]" aria-hidden>
        <div className="absolute inset-0 rounded-full border border-line" />
        <div className="absolute inset-[30px] rounded-full border border-line-subtle" />
        <motion.div className="absolute inset-0" animate={{ rotate: 360 }} transition={{ duration: 60, ease: "linear", repeat: Infinity }}>
          {lanes.map((p, i) => {
            const angle = (i / lanes.length) * Math.PI * 2;
            return (
              <span key={p} className="absolute" style={{ left: 90 + Math.cos(angle) * 90 - 14, top: 90 + Math.sin(angle) * 90 - 14 }}>
                <motion.span className="block" animate={{ rotate: -360 }} transition={{ duration: 60, ease: "linear", repeat: Infinity }}>
                  <PlatformIcon platform={p} size={28} className="shadow-md" />
                </motion.span>
              </span>
            );
          })}
        </motion.div>
        <div className="absolute inset-0 flex items-center justify-center">
          <OrbitMark size={56} />
        </div>
      </div>
      <h1 className="text-[2rem] font-semibold leading-[1.15] tracking-[-0.035em] text-balance sm:text-[2.5rem]">Every conversation. One calm place.</h1>
      <p className="mx-auto mt-4 max-w-[480px] text-[0.9375rem] leading-relaxed text-fg-2 text-balance">
        Orbit brings your email, work chat and messages into one keyboard-first inbox, with every account, honest integrations, and an assistant that helps you keep up.
      </p>
      <div className="mt-8 flex justify-center">
        <Button variant="primary" size="lg" onClick={onNext}>
          Get started <ArrowRight />
        </Button>
      </div>
      <p className="mt-6 text-xs text-fg-4">Official APIs only. Orbit never stores your passwords and never sends anything on its own.</p>
    </div>
  );
}

function ChoosePlatforms({ selected, onToggle, onBack, onNext }: { selected: PlatformId[]; onToggle: (p: PlatformId) => void; onBack: () => void; onNext: () => void }) {
  return (
    <div>
      <h1 className="text-[1.625rem] font-semibold tracking-[-0.03em]">Where do your conversations happen?</h1>
      <p className="mt-2 text-[0.9375rem] text-fg-2">Pick everything you use. We&apos;ll be upfront about what each platform&apos;s API allows.</p>
      <div className="mt-8">
        <IntegrationCatalog selectable selected={selected} onToggle={onToggle} />
      </div>
      <Nav onBack={onBack} onNext={onNext} nextLabel={selected.length ? `Continue with ${selected.length}` : "Continue"} />
    </div>
  );
}

function Connect({ platforms, onBack, onNext, onDemo, demoLoaded }: { platforms: PlatformId[]; onBack: () => void; onNext: () => void; onDemo: () => void; demoLoaded: boolean }) {
  const { status } = useServerStatus();
  const [open, setOpen] = useState<PlatformId | null>(null);
  const list = platforms.length ? platforms : (["gmail", "slack", "telegram"] as PlatformId[]);
  return (
    <div className="mx-auto max-w-[680px]">
      <h1 className="text-[1.625rem] font-semibold tracking-[-0.03em]">Connect your accounts</h1>
      <p className="mt-2 text-[0.9375rem] text-fg-2">Add as many accounts per platform as you like: personal, work, university. You can do this later in Settings.</p>
      <div className="mt-8 overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
        {list.map((p) => {
          const info = PLATFORMS[p];
          const st = status?.connectors.find((c) => c.platform === p);
          return (
            <div key={p} className="border-b border-line-subtle px-4 py-4 last:border-b-0">
              <div className="flex items-start gap-3">
                <PlatformIcon platform={p} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.875rem] font-semibold">{info.name}</span>
                    <SupportBadge info={info} status={st} />
                  </div>
                  <p className="mt-0.5 text-xs leading-[1.125rem] text-fg-3">{info.summary}</p>
                  <div className="mt-2.5">
                    <ConnectAction info={info} status={st} expanded={open === p} onExpand={() => setOpen(open === p ? null : p)} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-5">
        {demoLoaded ? (
          <p className="flex items-center gap-2 text-[0.8125rem] text-success">
            <Check className="size-4" /> Sample workspace loaded
          </p>
        ) : (
          <DemoCallout onUse={onDemo} />
        )}
      </div>
      <Nav onBack={onBack} onNext={onNext} />
    </div>
  );
}

function Preferences({
  prefs,
  setPrefs,
  onBack,
  onNext,
}: {
  prefs: ReturnType<typeof useWorkspace.getState>["prefs"];
  setPrefs: (p: Partial<ReturnType<typeof useWorkspace.getState>["prefs"]>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mx-auto max-w-[620px]">
      <h1 className="text-[1.625rem] font-semibold tracking-[-0.03em]">Make it yours</h1>
      <p className="mt-2 text-[0.9375rem] text-fg-2">Change any of these later in Settings.</p>

      <div className="mt-8 space-y-7">
        <Question title="What will you mostly use Orbit for?">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: "personal", label: "Personal", desc: "Friends, family, life admin", filter: "personal" },
                { id: "professional", label: "Professional", desc: "Work, clients, career", filter: "professional" },
                { id: "both", label: "Both", desc: "Everything in one place", filter: "all" },
              ] as const
            ).map((o) => (
              <Choice key={o.id} selected={prefs.usage === o.id} onClick={() => setPrefs({ usage: o.id, defaultFilter: o.filter as QuickFilter })} title={o.label} desc={o.desc} />
            ))}
          </div>
        </Question>

        <Question title="Theme">
          <Segmented
            value={prefs.theme}
            onChange={(v) => setPrefs({ theme: v })}
            ariaLabel="Theme"
            options={[
              { value: "light", label: "Light", icon: <Sun /> },
              { value: "dark", label: "Dark", icon: <Moon /> },
              { value: "system", label: "System", icon: <Monitor /> },
            ]}
          />
        </Question>

        <Question title="Inbox layout">
          <div className="grid grid-cols-2 gap-2">
            <Choice selected={prefs.density === "comfortable"} onClick={() => setPrefs({ density: "comfortable" })} title="Comfortable" desc="Two-line previews, more breathing room" />
            <Choice selected={prefs.density === "compact"} onClick={() => setPrefs({ density: "compact" })} title="Compact" desc="More conversations on screen" />
          </div>
        </Question>

        <Question title="Notifications">
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <label className="flex items-center gap-3 border-b border-line-subtle px-4 py-3 text-[0.8125rem]">
              <span className="flex-1">
                <span className="font-medium">Only priority interrupts</span>
                <span className="block text-xs text-fg-3">VIPs, mentions and deadlines notify; everything else arrives quietly.</span>
              </span>
              <Switch checked={prefs.priorityOnlyNotifications} onCheckedChange={(v) => setPrefs({ priorityOnlyNotifications: v })} aria-label="Only priority interrupts" />
            </label>
            <label className="flex items-center gap-3 px-4 py-3 text-[0.8125rem]">
              <span className="flex-1">
                <span className="font-medium">Quiet hours, 10 PM – 7:30 AM</span>
                <span className="block text-xs text-fg-3">Hold non-priority notifications overnight.</span>
              </span>
              <Switch checked={prefs.quietHours.enabled} onCheckedChange={(v) => setPrefs({ quietHours: { ...prefs.quietHours, enabled: v } })} aria-label="Quiet hours" />
            </label>
          </div>
        </Question>
      </div>
      <Nav onBack={onBack} onNext={onNext} />
    </div>
  );
}

function Question({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 text-[0.8125rem] font-medium text-fg">{title}</h2>
      {children}
    </section>
  );
}

function Choice({ selected, onClick, title, desc }: { selected: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={cn("rounded-lg border bg-surface px-3.5 py-3 text-left transition-[border-color,box-shadow]", selected ? "border-accent ring-3 ring-accent-soft" : "border-line hover:border-line-strong")}
    >
      <span className="flex items-center justify-between text-[0.8125rem] font-semibold">
        {title}
        {selected ? <Check className="size-3.5 text-accent-text" /> : null}
      </span>
      <span className="mt-0.5 block text-xs text-fg-3">{desc}</span>
    </button>
  );
}

function Ready({ accounts, demo, usage, onFinish, onDemo }: { accounts: number; demo: boolean; usage: string; onFinish: () => void; onDemo: () => void }) {
  return (
    <div className="mx-auto max-w-[520px] pt-8 text-center">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="mx-auto mb-6 inline-flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
        <Check className="size-7" />
      </motion.div>
      <h1 className="text-[1.75rem] font-semibold tracking-[-0.03em]">{accounts > 0 ? "Your inbox is ready" : "You're all set"}</h1>
      <p className="mx-auto mt-3 max-w-[420px] text-[0.9375rem] leading-relaxed text-fg-2">
        {accounts > 0
          ? demo
            ? `We loaded ${accounts} sample accounts so you can try everything. Connect your own whenever you're ready.`
            : `${accounts} account${accounts === 1 ? "" : "s"} connected. Orbit will keep syncing in the background.`
          : "No accounts yet. Connect one from Settings, or start with sample data."}
        {usage === "professional" ? " We'll start you on professional conversations." : usage === "personal" ? " We'll start you on personal conversations." : ""}
      </p>
      <div className="mt-6 grid grid-cols-3 gap-2 text-left text-xs text-fg-3">
        <Tip k="⌘ K" t="Search anything" />
        <Tip k="C" t="Compose" />
        <Tip k="?" t="All shortcuts" />
      </div>
      <div className="mt-8 flex justify-center gap-2">
        {accounts === 0 ? (
          <Button size="lg" onClick={onDemo}>
            Use sample data
          </Button>
        ) : null}
        <Button variant="primary" size="lg" onClick={onFinish}>
          Open Orbit <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

function Tip({ k, t }: { k: string; t: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
      <div className="font-mono text-[0.8125rem] font-semibold text-fg">{k}</div>
      <div className="mt-0.5">{t}</div>
    </div>
  );
}
