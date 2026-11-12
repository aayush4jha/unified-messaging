import type { MetadataRoute } from "next";

/**
 * Web app manifest: makes Orbit installable (Android/desktop "Install app",
 * iOS "Add to Home Screen") and drives the Android APK, which is generated
 * from this manifest (see docs/MOBILE.md).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Orbit — unified inbox",
    short_name: "Orbit",
    description: "One inbox. Every conversation. Every account. One workspace.",
    start_url: "/inbox?source=app",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#1c1b19",
    theme_color: "#1c1b19",
    categories: ["productivity", "business", "social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "New message", short_name: "Compose", url: "/share?source=shortcut", icons: [{ src: "/icons/shortcut-compose.png", sizes: "96x96", type: "image/png" }] },
      { name: "Unread", url: "/inbox?folder=unread&source=shortcut", icons: [{ src: "/icons/shortcut-unread.png", sizes: "96x96", type: "image/png" }] },
      { name: "Search", url: "/search?source=shortcut", icons: [{ src: "/icons/shortcut-search.png", sizes: "96x96", type: "image/png" }] },
      { name: "Follow-ups", url: "/follow-ups?source=shortcut", icons: [{ src: "/icons/shortcut-followups.png", sizes: "96x96", type: "image/png" }] },
    ],
    // "Share → Orbit" from any app (Android): opens a new message prefilled with the shared text/link.
    share_target: { action: "/share", method: "GET", params: { title: "title", text: "text", url: "url" } },
    screenshots: [
      { src: "/screenshots/mobile-inbox.png", sizes: "1080x2400", type: "image/png", form_factor: "narrow", label: "Every account in one inbox" },
      { src: "/screenshots/mobile-conversation.png", sizes: "1080x2400", type: "image/png", form_factor: "narrow", label: "Reply from one place" },
      { src: "/screenshots/desktop-inbox.png", sizes: "2880x1800", type: "image/png", form_factor: "wide", label: "Orbit on desktop" },
    ],
  };
}
