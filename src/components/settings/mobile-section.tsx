"use client";

import { Check, Copy, Share2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useDevice } from "@/lib/pwa";
import { InstallSteps } from "../pwa/install";
import { DevicePushRow } from "../pwa/push";
import { Button } from "../ui/button";
import { Card, SectionTitle, SettingRow } from "./parts";

/** Settings → Mobile app: install on this device, notifications here, and the link to share Orbit. */
export function MobileSection() {
  const device = useDevice();
  return (
    <>
      <SectionTitle title="Mobile app" description="Orbit runs on iPhone, Android and desktop from one account. Installed apps update automatically." />

      <Card className="p-4">
        <h3 className="mb-3 text-[0.8125rem] font-medium text-fg">{device?.standalone ? "This device" : "Install on this device"}</h3>
        <InstallSteps />
      </Card>

      <h3 className="mb-2 mt-7 text-xs font-medium text-fg-2">Notifications on this device</h3>
      <Card>
        <DevicePushRow />
      </Card>

      <h3 className="mb-2 mt-7 text-xs font-medium text-fg-2">Share Orbit</h3>
      <Card>
        <SettingRow
          title="Download page"
          description={
            <>
              One link for everyone: Android gets the app download, iPhone gets Add to Home Screen steps, desktop gets a QR code.{" "}
              <Link href="/download" className="font-medium text-accent-text hover:underline">
                Open
              </Link>
            </>
          }
        >
          <ShareLinkButton />
        </SettingRow>
      </Card>
    </>
  );
}

function ShareLinkButton() {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${location.origin}/download`;
    if (navigator.share) {
      await navigator.share({ title: "Orbit", text: "All your messages in one inbox. Get the app:", url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  return (
    <Button onClick={share}>
      {copied ? <Check /> : canShare ? <Share2 /> : <Copy />} {copied ? "Copied" : canShare ? "Share" : "Copy link"}
    </Button>
  );
}
