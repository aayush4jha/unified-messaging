import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Orbit", template: "%s · Orbit" },
  description: "One inbox. Every conversation. Every account. One workspace.",
  applicationName: "Orbit",
  // iOS "Add to Home Screen": full-screen app with its own icon (src/app/apple-icon.png).
  appleWebApp: { capable: true, title: "Orbit", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false, email: false, address: false },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw under the notch / home indicator; the app frame pads itself with safe-area insets.
  viewportFit: "cover",
  // Android: the on-screen keyboard shrinks the layout so the composer stays visible.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#151413" },
  ],
};

/**
 * Applies theme / accent / density before first paint so there's no flash.
 * Reads the same persisted preferences the workspace store uses.
 */
const themeScript = `(() => {
  try {
    var raw = localStorage.getItem("orbit-workspace-v1");
    var prefs = raw ? (JSON.parse(raw).state || {}).prefs || {} : {};
    var t = prefs.theme || "system";
    var dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    var el = document.documentElement;
    el.dataset.theme = dark ? "dark" : "light";
    el.dataset.accent = prefs.accent || "vermilion";
    el.dataset.density = prefs.density || "comfortable";
  } catch (e) {
    document.documentElement.dataset.theme = "light";
  }
})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`} suppressHydrationWarning data-theme="light">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="h-full overflow-hidden">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
