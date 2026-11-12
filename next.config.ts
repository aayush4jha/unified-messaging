import type { NextConfig } from "next";

/**
 * Security headers for every response. CSP here restricts framing, plugins,
 * base URIs and form targets; script-src isn't locked down because the app
 * relies on Next's inline bootstrap and the pre-paint theme script.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self' https://accounts.google.com https://login.microsoftonline.com https://slack.com https://www.facebook.com https://www.instagram.com" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Service worker: always revalidated so app updates reach installed devices immediately.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      // The Android app download (see docs/MOBILE.md).
      {
        source: "/downloads/:file*.apk",
        headers: [
          { key: "Content-Type", value: "application/vnd.android.package-archive" },
          { key: "Content-Disposition", value: "attachment; filename=Orbit.apk" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      // Digital Asset Links: lets the Android app open Orbit full screen, without a browser bar.
      { source: "/.well-known/assetlinks.json", headers: [{ key: "Content-Type", value: "application/json" }, { key: "Access-Control-Allow-Origin", value: "*" }] },
    ];
  },
  devIndicators: false,
  // Node-only mail libraries used by the IMAP/SMTP connector (server routes only).
  serverExternalPackages: ["imapflow", "nodemailer", "mailparser", "web-push"],
  cacheComponents: true,
  experimental: {
    // Navigations and prefetches wait for the network and retry instead of failing (mobile connections drop).
    useOffline: true,
  },
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
