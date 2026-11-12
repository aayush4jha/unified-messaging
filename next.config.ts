import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
