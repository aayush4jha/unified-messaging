/**
 * Install + device helpers for the mobile apps. Orbit ships as one web app
 * that installs three ways: Android (APK or "Install app"), iOS ("Add to Home
 * Screen"), and desktop browsers. See docs/MOBILE.md.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

export type DevicePlatform = "ios" | "android" | "desktop";

export interface DeviceInfo {
  platform: DevicePlatform;
  /** Running as an installed app (home-screen PWA, Android APK, desktop app window). */
  standalone: boolean;
  /** iOS only: Safari / third-party browser that can Add to Home Screen, vs an in-app browser that can't. */
  iosBrowser?: "safari" | "other-browser" | "in-app";
}

export function detectPlatform(ua: string, maxTouchPoints = 0): DevicePlatform {
  // iPadOS reports a desktop Mac user agent; touch support gives it away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

export function detectIosBrowser(ua: string): DeviceInfo["iosBrowser"] {
  if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return "other-browser";
  // In-app browsers (Instagram, Facebook, LinkedIn, Gmail…) drop the "Safari/" token and can't install.
  if (/FBAN|FBAV|Instagram|LinkedInApp|GSA\/|Line\//.test(ua) || !/Safari\//.test(ua)) return "in-app";
  return "safari";
}

export function readDevice(): DeviceInfo {
  if (typeof window === "undefined") return { platform: "desktop", standalone: false };
  const ua = navigator.userAgent;
  const platform = detectPlatform(ua, navigator.maxTouchPoints);
  return { platform, standalone: isStandalone(), iosBrowser: platform === "ios" ? detectIosBrowser(ua) : undefined };
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: minimal-ui)").matches) return true;
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  // Android APK (Trusted Web Activity) launches with an android-app:// referrer.
  try {
    if (document.referrer.startsWith("android-app://")) sessionStorage.setItem("orbit-twa", "1");
    return sessionStorage.getItem("orbit-twa") === "1";
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------ Install prompt */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let justInstalled = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  // Captured as early as possible: Chrome fires this once, shortly after load.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    justInstalled = true;
    emit();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The browser's native install prompt (Chrome/Edge/Samsung Internet on Android and desktop), when offered. */
export function useInstallPrompt() {
  const canPrompt = useSyncExternalStore(subscribe, () => deferredPrompt !== null, () => false);
  const installed = useSyncExternalStore(subscribe, () => justInstalled, () => false);
  return {
    canPrompt,
    installed,
    async prompt(): Promise<"accepted" | "dismissed" | "unavailable"> {
      const p = deferredPrompt;
      if (!p) return "unavailable";
      await p.prompt();
      const { outcome } = await p.userChoice;
      deferredPrompt = null;
      emit();
      return outcome;
    },
  };
}

const noop = () => () => {};
/** Device info after hydration (server render and first paint see a neutral desktop default). */
export function useDevice(): DeviceInfo | null {
  return useSyncExternalStore(noop, readDeviceCached, () => null);
}
let cachedDevice: DeviceInfo | null = null;
function readDeviceCached() {
  return (cachedDevice ??= readDevice());
}

/** Where the Android APK is published (same origin, so the share link is just /download). */
export const ANDROID_APK_PATH = "/downloads/orbit.apk";

/** Written next to the APK by scripts/build-android.sh. */
export interface ApkInfo {
  version: string;
  versionCode: number;
  packageId: string;
  sizeBytes: number;
  sha256: string;
  builtAt: string;
}

let apkInfo: Promise<ApkInfo | null> | null = null;
export function fetchApkInfo(): Promise<ApkInfo | null> {
  return (apkInfo ??= fetch("/downloads/android.json", { cache: "no-cache" })
    .then((r) => (r.ok ? (r.json() as Promise<ApkInfo>) : null))
    .catch(() => null));
}

/** The published Android build, `null` when this deployment has none, `undefined` while loading. */
export function useApkInfo(): ApkInfo | null | undefined {
  const [info, setInfo] = useState<ApkInfo | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void fetchApkInfo().then((i) => alive && setInfo(i));
    return () => {
      alive = false;
    };
  }, []);
  return info;
}
