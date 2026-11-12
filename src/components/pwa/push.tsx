"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { readDevice, type DeviceInfo } from "@/lib/pwa";
import { useWorkspace } from "@/store/workspace";
import { Button } from "../ui/button";
import { Switch } from "../ui/controls";
import { SettingRow } from "../settings/parts";
import { InstallDialog } from "./install";

/** Set while this device holds a push subscription, so the open app doesn't double-notify. */
export const PUSH_FLAG = "orbit-push-device";

type PushState =
  | { kind: "loading" }
  | { kind: "unsupported"; noWorker?: boolean }
  | { kind: "needs-install" }
  | { kind: "local" }
  | { kind: "server-off" }
  | { kind: "denied" }
  | { kind: "off"; publicKey: string }
  | { kind: "on"; publicKey: string; endpoint: string };

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function readPushState(live: boolean, device: DeviceInfo): Promise<PushState> {
  // iPhone/iPad only expose push to apps added to the Home Screen.
  if (device.platform === "ios" && !device.standalone) return { kind: "needs-install" };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return { kind: "unsupported" };
  if (!live) return { kind: "local" };
  const server = (await fetch("/api/push")
    .then((r) => r.json())
    .catch(() => null)) as { configured?: boolean; publicKey?: string } | null;
  if (!server?.configured || !server.publicKey) return { kind: "server-off" };
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return { kind: "unsupported", noWorker: true };
  if (Notification.permission === "denied") return { kind: "denied" };
  const sub = await reg.pushManager.getSubscription();
  return sub ? { kind: "on", publicKey: server.publicKey, endpoint: sub.endpoint } : { kind: "off", publicKey: server.publicKey };
}

async function subscribe(publicKey: string): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? { kind: "denied" } : { kind: "off", publicKey };
  const reg = await navigator.serviceWorker.ready;
  const key = base64UrlToBytes(publicKey);
  let sub: PushSubscription;
  try {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  } catch {
    // An old subscription made with a different server key blocks a new one.
    await (await reg.pushManager.getSubscription())?.unsubscribe();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  }
  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  });
  if (!res.ok) {
    await sub.unsubscribe();
    throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't register this device");
  }
  localStorage.setItem(PUSH_FLAG, "1");
  return { kind: "on", publicKey, endpoint: sub.endpoint };
}

async function unsubscribe(state: Extract<PushState, { kind: "on" }>): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  await (await reg?.pushManager.getSubscription())?.unsubscribe();
  await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: state.endpoint }) }).catch(() => undefined);
  localStorage.removeItem(PUSH_FLAG);
  return { kind: "off", publicKey: state.publicKey };
}

const DESCRIPTIONS: Record<PushState["kind"], string> = {
  loading: "Checking this device…",
  unsupported: "This browser can't receive push notifications.",
  "needs-install": "On iPhone and iPad, add Orbit to your Home Screen first. Apple only allows notifications for installed apps.",
  local: "Sign in to your Orbit account to get notifications while the app is closed. Sample workspaces notify only while open.",
  "server-off": "This Orbit server doesn't have push set up yet (VAPID keys, see docs/MOBILE.md).",
  denied: "Blocked for Orbit. Allow notifications in your phone or browser settings, then come back.",
  off: "Get new messages, reminders and account alerts even when Orbit is closed. Quiet hours and Do Not Disturb still apply.",
  on: "This device gets notifications even when Orbit is closed. Quiet hours and Do Not Disturb still apply.",
};

/** Settings row: turn push on/off for the current device. */
export function DevicePushRow() {
  const live = useWorkspace((s) => s.mode === "live");
  const [state, setState] = useState<PushState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void readPushState(live, readDevice()).then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, [live]);

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      if (on && (state.kind === "off" || state.kind === "on")) setState(await subscribe(state.publicKey));
      if (!on && state.kind === "on") setState(await unsubscribe(state));
    } catch (e) {
      toast.error("Couldn't turn on notifications", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    const res = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { sent?: number; error?: string } | null;
    if (!res?.ok) toast.error("Couldn't send a test", { description: data?.error });
    else toast(data?.sent ? `Test sent to ${data.sent} device${data.sent === 1 ? "" : "s"}` : "No devices received it", { description: data?.sent ? "It can take a few seconds to arrive." : "Turn notifications off and on again on this device." });
  };

  const description = state.kind === "unsupported" && state.noWorker ? "Available in the installed app (production build)." : DESCRIPTIONS[state.kind];

  return (
    <>
      <SettingRow title="Push notifications" description={description}>
        {state.kind === "needs-install" ? (
          <Button size="sm" onClick={() => setInstallOpen(true)}>
            How to install
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            {state.kind === "on" ? (
              <Button size="sm" variant="ghost" onClick={sendTest}>
                Send test
              </Button>
            ) : null}
            <Switch checked={state.kind === "on"} disabled={busy || (state.kind !== "on" && state.kind !== "off")} onCheckedChange={(v) => void toggle(v)} aria-label="Push notifications on this device" />
          </div>
        )}
      </SettingRow>
      <InstallDialog open={installOpen} onOpenChange={setInstallOpen} />
    </>
  );
}
