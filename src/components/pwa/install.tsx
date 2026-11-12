"use client";

import { Check, Copy, Download, ExternalLink, MoreHorizontal, MoreVertical, Share, Smartphone, SquarePlus, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ANDROID_APK_PATH, useApkInfo, useDevice, useInstallPrompt, type DeviceInfo } from "@/lib/pwa";
import { cn } from "@/lib/utils";
import { OrbitMark } from "../brand/platform-icon";
import { Button, IconButton } from "../ui/button";
import { Dialog, DialogContent } from "../ui/dialog";

const DISMISS_KEY = "orbit-install-banner-dismissed";
const DISMISS_DAYS = 14;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/** A quiet card at the top of the inbox on phones that haven't installed Orbit yet. */
export function InstallBanner({ className }: { className?: string }) {
  const device = useDevice();
  const { canPrompt, installed } = useInstallPrompt();
  const [hidden, setHidden] = useState(dismissedRecently);
  const [open, setOpen] = useState(false);
  if (!device || hidden || installed || device.standalone || device.platform === "desktop") return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  return (
    <>
      <div className={cn("mx-3 mt-2.5 flex shrink-0 items-center gap-3 rounded-md border border-line bg-surface-sunken py-2 pl-3 pr-1.5 animate-fade-in", className)}>
        <OrbitMark size={26} />
        <div className="min-w-0 flex-1">
          <p className="text-[0.8125rem] font-medium text-fg">Get the Orbit app</p>
          <p className="hidden text-xs text-fg-3 min-[400px]:block">Notifications, full screen, works offline.</p>
        </div>
        <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
          {canPrompt ? "Install" : "Get app"}
        </Button>
        <IconButton size="sm" label="Dismiss" onClick={dismiss}>
          <X />
        </IconButton>
      </div>
      <InstallDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function InstallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Install Orbit" description="Same account and inbox on every device. Updates arrive automatically." size="sm">
        <div className="px-5 pb-5 pt-2">
          <InstallSteps onDone={() => onOpenChange(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Platform-aware install instructions; used by the banner dialog, Settings and /download. */
export function InstallSteps({ onDone, forPlatform }: { onDone?: () => void; forPlatform?: DeviceInfo["platform"] }) {
  const detected = useDevice();
  const { canPrompt, installed, prompt } = useInstallPrompt();
  const device: DeviceInfo | null = forPlatform ? { platform: forPlatform, standalone: false, iosBrowser: forPlatform === "ios" ? "safari" : undefined } : detected;
  if (!device) return null;

  if (!forPlatform && (device.standalone || installed)) {
    return (
      <p className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2.5 text-[0.8125rem] font-medium text-success">
        <Check className="size-4" /> Orbit is installed on this device.
      </p>
    );
  }

  const nativeInstall = canPrompt && !forPlatform ? (
    <Button
      variant="primary"
      size="lg"
      className="w-full"
      onClick={async () => {
        const outcome = await prompt();
        if (outcome === "accepted") {
          toast("Orbit installed", { description: "Open it from your home screen or app list." });
          onDone?.();
        }
      }}
    >
      <Download /> Install Orbit
    </Button>
  ) : null;

  if (device.platform === "ios") {
    if (device.iosBrowser === "in-app") {
      return (
        <div className="space-y-3">
          <Steps
            steps={[
              { icon: <MoreHorizontal />, text: <>Tap <b>•••</b> (or the compass icon) and choose <b>Open in Safari</b>.</> },
              { icon: <Share />, text: <>In Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>.</> },
            ]}
          />
          <CopyLink />
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <Steps
          steps={[
            { icon: <Share />, text: device.iosBrowser === "other-browser" ? <>Tap <b>Share</b> in the address bar.</> : <>Tap <b>Share</b> in Safari&apos;s toolbar.</> },
            { icon: <SquarePlus />, text: <>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</> },
            { icon: <Smartphone />, text: <>Open Orbit from your home screen. Turn on notifications in <b>Settings → Mobile app</b>.</> },
          ]}
        />
        <p className="text-xs text-fg-3">Free on iPhone and iPad (iOS 16.4 or later for notifications). No App Store needed.</p>
      </div>
    );
  }

  if (device.platform === "android") {
    return (
      <div className="space-y-4">
        {nativeInstall}
        <AndroidApk secondary={!!nativeInstall} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {nativeInstall ?? <p className="text-[0.8125rem] text-fg-2">Use the install icon in your browser&apos;s address bar, or open Orbit on your phone.</p>}
      <Button asChild variant="secondary" className="w-full">
        <Link href="/download" onClick={onDone}>
          <Smartphone /> Get Orbit on your phone <ExternalLink className="!size-3" />
        </Link>
      </Button>
    </div>
  );
}

function AndroidApk({ secondary }: { secondary: boolean }) {
  const apk = useApkInfo();
  if (apk === undefined) return <div className="h-[132px] rounded-md border border-line" aria-busy="true" />;
  if (apk === null) {
    return (
      <Steps
        steps={[
          { icon: <MoreVertical />, text: <>Open your browser menu <b>⋮</b> and tap <b>Install app</b> (or <b>Add to Home screen</b>).</> },
          { icon: <Smartphone />, text: <>Open Orbit from your home screen or app drawer.</> },
        ]}
      />
    );
  }
  return (
    <div className={cn("rounded-md border border-line p-3", secondary && "bg-surface-sunken")}>
      <p className="text-[0.8125rem] font-medium text-fg">{secondary ? "Or download the Android app" : "Download the Android app"}</p>
      <p className="mt-0.5 text-xs text-fg-3">Open the file when it finishes downloading. If Android asks, allow installs from your browser, then tap Install.</p>
      <Button asChild size="md" className="mt-2.5 w-full" variant={secondary ? "secondary" : "primary"}>
        <a href={ANDROID_APK_PATH} download="Orbit.apk">
          <Download /> Download Orbit.apk <span className="font-normal opacity-80">· {formatBytes(apk.sizeBytes)}</span>
        </a>
      </Button>
    </div>
  );
}

export function formatBytes(n: number) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;
}

export function Steps({ steps }: { steps: { icon: React.ReactNode; text: React.ReactNode }[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-hover text-fg-2 [&_svg]:size-4" aria-hidden>
            {s.icon}
          </span>
          <span className="pt-1.5 text-[0.8125rem] leading-5 text-fg-2 [&_b]:font-semibold [&_b]:text-fg">
            <span className="sr-only">Step {i + 1}: </span>
            {s.text}
          </span>
        </li>
      ))}
    </ol>
  );
}

function CopyLink() {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      className="w-full"
      onClick={async () => {
        await navigator.clipboard?.writeText(`${location.origin}/download`).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? "Link copied" : "Copy link to open in Safari"}
    </Button>
  );
}
