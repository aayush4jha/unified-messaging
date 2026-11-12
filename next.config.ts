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
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  devIndicators: false,
  // Node-only mail libraries used by the IMAP/SMTP connector (server routes only).
  serverExternalPackages: ["imapflow", "nodemailer", "mailparser"],
  cacheComponents: true,
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
