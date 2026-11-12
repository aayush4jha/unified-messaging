import type { Metadata } from "next";
import { DownloadView } from "@/components/pwa/download-view";

export const metadata: Metadata = {
  title: "Get the app",
  description: "Orbit for Android, iPhone and desktop: every conversation and account in one inbox.",
  openGraph: {
    title: "Orbit: every conversation, one app",
    description: "Gmail, Outlook, Slack, Teams, Telegram, WhatsApp Business, Messenger and Instagram in one inbox. Get it for Android, iPhone and desktop.",
    images: [{ url: "/screenshots/desktop-inbox.png", width: 2880, height: 1800, alt: "Orbit unified inbox" }],
  },
};

/** The link to share: Android gets the APK, iPhone gets Add to Home Screen, desktop gets a QR code. */
export default function DownloadPage() {
  return <DownloadView />;
}
