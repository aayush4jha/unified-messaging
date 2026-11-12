"use client";

import { ArrowRight, Check, Copy, Laptop, Monitor, Smartphone } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PLATFORMS } from "@/lib/platforms";
import { useApkInfo, useDevice } from "@/lib/pwa";
import type { PlatformId } from "@/lib/types";
import { OrbitLogo, PlatformIcon } from "../brand/platform-icon";
import { Button } from "../ui/button";
import { formatBytes, InstallSteps } from "./install";

const LIVE: PlatformId[] = (Object.keys(PLATFORMS) as PlatformId[]).filter((p) => PLATFORMS[p].support === "live");

/** The one link to share: /download. Picks the right install path for the visitor's device. */
export function DownloadView() {
  const device = useDevice();
  const apk = useApkInfo();

  return (
    <div className="app-frame overflow-y-auto bg-bg text-fg">
      <header className="mx-auto flex h-16 max-w-[1040px] items-center justify-between px-5 sm:px-8">
        <OrbitLogo />
        <Button asChild variant="ghost" size="sm">
          <Link href="/inbox">
            Open in browser <ArrowRight />
          </Link>
        </Button>
      </header>

      <main className="mx-auto max-w-[1040px] px-5 pb-[max(4rem,calc(env(safe-area-inset-bottom)+2rem))] sm:px-8">
        <section className="grid items-center gap-10 pt-6 sm:pt-12 lg:grid-cols-[1fr_300px] lg:gap-16">
          <div>
            <h1 className="text-balance text-[2rem] font-semibold leading-[1.1] tracking-[-0.035em] sm:text-[2.75rem]">Every conversation. One app.</h1>
            <p className="mt-4 max-w-[540px] text-[0.9375rem] leading-6 text-fg-2">
              Gmail, Outlook, Slack, Teams, Telegram, WhatsApp Business, Messenger, Instagram and any email account in one fast inbox, on your phone and your computer.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2" aria-label="Works with">
              {LIVE.map((p) => (
                <li key={p} className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-1.5 pr-2.5 text-xs text-fg-2">
                  <PlatformIcon platform={p} size={16} /> {PLATFORMS[p].shortName}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-fg-3">WhatsApp, Messenger and Instagram connect business accounts and pages.</p>

            <div className="mt-8 max-w-[440px] rounded-lg border border-line bg-surface p-5 shadow-sm">
              {device === null ? (
                <div className="h-40" aria-busy="true" />
              ) : device.platform === "desktop" && !device.standalone ? (
                <DesktopCard />
              ) : (
                <>
                  <h2 className="mb-3 flex items-center gap-2 text-[0.9375rem] font-semibold">
                    <Smartphone className="size-4 text-fg-3" /> {device.platform === "ios" ? "Install on your iPhone or iPad" : "Install on your Android phone"}
                  </h2>
                  <InstallSteps />
                </>
              )}
            </div>
          </div>

          <div className="mx-auto hidden w-[280px] overflow-hidden rounded-[36px] border-[6px] border-fg bg-fg shadow-xl lg:block" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/screenshots/mobile-inbox.png" alt="" width={1080} height={2400} className="block h-auto w-full rounded-[30px]" />
          </div>
        </section>

        <section className="mt-16" aria-labelledby="all-devices">
          <h2 id="all-devices" className="text-[1.0625rem] font-semibold tracking-[-0.015em]">
            All devices
          </h2>
          <p className="mt-1 text-[0.8125rem] text-fg-3">One account everywhere. Installed apps update themselves, so there&apos;s nothing to download again.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <DeviceCard icon={<Smartphone />} title="Android" note={apk ? `Version ${apk.version} · ${formatBytes(apk.sizeBytes)}` : "Android 7 or later"}>
              <InstallSteps forPlatform="android" />
            </DeviceCard>
            <DeviceCard icon={<Smartphone />} title="iPhone & iPad" note="iOS 16.4 or later for notifications">
              <InstallSteps forPlatform="ios" />
            </DeviceCard>
            <DeviceCard icon={<Laptop />} title="Mac, Windows, Linux" note="Chrome, Edge, Safari or Firefox">
              <p className="text-[0.8125rem] leading-5 text-fg-2">
                Open Orbit in your browser. In Chrome or Edge, click the install icon in the address bar to get Orbit in its own window. In Safari on a Mac, choose <b className="font-semibold text-fg">File → Add to Dock</b>.
              </p>
              <Button asChild variant="secondary" className="mt-4 w-full">
                <Link href="/inbox">
                  <Monitor /> Open Orbit
                </Link>
              </Button>
            </DeviceCard>
          </div>
        </section>

        <section className="mt-16 max-w-[720px]" aria-labelledby="faq">
          <h2 id="faq" className="text-[1.0625rem] font-semibold tracking-[-0.015em]">
            Questions
          </h2>
          <div className="mt-4 divide-y divide-line-subtle rounded-lg border border-line bg-surface">
            <Faq q="Why does Android ask before installing?">
              The Android app comes straight from this site rather than the Play Store, so Android asks you once to allow installs from your browser. The app is signed and only opens Orbit from this site; it doesn&apos;t install anything else.
              {apk ? (
                <span className="mt-2 block break-all font-mono text-[0.6875rem] text-fg-3">
                  {apk.packageId} · SHA-256 {apk.sha256}
                </span>
              ) : null}
            </Faq>
            <Faq q="Why isn't there an App Store download for iPhone?">
              Apple only allows apps from the App Store or TestFlight. Adding Orbit to your Home Screen gives you the same experience: full screen, its own icon, notifications, and it works offline.
            </Faq>
            <Faq q="Do I need to update the app?">No. The app always opens the latest Orbit, so new features and fixes arrive on their own.</Faq>
            <Faq q="Can I try it without connecting my accounts?">
              Yes. Open Orbit and choose <b className="font-semibold text-fg">Use sample data</b> to explore with clearly labeled example conversations. Nothing is sent anywhere.
            </Faq>
          </div>
        </section>
      </main>
    </div>
  );
}

function DesktopCard() {
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(location.origin);
  }, []);
  const url = origin ? `${origin}/download` : null;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
      <div className="shrink-0 rounded-md bg-white p-2 ring-1 ring-line">{url ? <QrCode value={url} size={132} /> : <div className="size-[132px]" />}</div>
      <div className="min-w-0">
        <h2 className="text-[0.9375rem] font-semibold">Get Orbit on your phone</h2>
        <p className="mt-1 text-[0.8125rem] leading-5 text-fg-2">Point your phone&apos;s camera at the code. Android gets the app download, iPhone gets Add to Home Screen.</p>
        {url ? <CopyButton text={url} /> : null}
      </div>
    </div>
  );
}

function DeviceCard({ icon, title, note, children }: { icon: React.ReactNode; title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-lg border border-line bg-surface p-5 shadow-xs">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-md bg-hover text-fg-2 [&_svg]:size-4" aria-hidden>
          {icon}
        </span>
        <div>
          <h3 className="text-[0.875rem] font-semibold">{title}</h3>
          <p className="text-xs text-fg-3">{note}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group px-4 py-3.5 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-default list-none items-center justify-between gap-4 text-[0.875rem] font-medium text-fg">
        {q}
        <span className="text-fg-3 transition-transform group-open:rotate-45" aria-hidden>
          +
        </span>
      </summary>
      <div className="mt-2 text-[0.8125rem] leading-5 text-fg-2">{children}</div>
    </details>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      className="mt-3"
      onClick={async () => {
        await navigator.clipboard?.writeText(text).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

/** QR code rendered locally (no third-party service sees the link). */
function QrCode({ value, size }: { value: string; size: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void import("qrcode").then((QR) =>
      QR.toString(value, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#1c1b19", light: "#ffffff" } }).then((s) => alive && setSvg(s)),
    );
    return () => {
      alive = false;
    };
  }, [value]);
  return <div role="img" aria-label={`QR code for ${value}`} style={{ width: size, height: size }} className="[&_svg]:size-full" dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />;
}
