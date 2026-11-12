import type { Capabilities, PlatformCategory, PlatformId } from "./types";

/**
 * Platform registry — the single source of truth for what each provider
 * supports. Shared by the UI (to gate actions) and the server (connectors).
 *
 * `support` describes Orbit's implementation status honestly:
 *  - "live":        a real connector is implemented (needs env credentials to run)
 *  - "planned":     official API exists and is permitted; connector not built yet
 *  - "restricted":  official API does not allow personal-message access for
 *                   third-party apps (or only for business/partner accounts)
 */
export type SupportLevel = "live" | "planned" | "restricted";

export interface PlatformInfo {
  id: PlatformId;
  name: string;
  shortName: string;
  category: PlatformCategory;
  color: string;
  support: SupportLevel;
  authMethod: string;
  /** One-line description of what Orbit can access. */
  summary: string;
  /** Plain-language limitation shown in onboarding + settings. */
  limitation?: string;
  /** Supported alternative when direct access is restricted. */
  alternative?: { label: string; url: string };
  capabilities: Capabilities;
  /** Server env vars the connector needs before it can be offered. */
  requiredEnv: string[];
  multiAccount: boolean;
  docsUrl: string;
}

const none: Capabilities = {
  read: false,
  send: false,
  reply: false,
  compose: false,
  attachments: false,
  markRead: false,
  archive: false,
  readReceipts: false,
  threads: false,
  subjects: false,
  recipients: false,
  reactions: false,
  realtime: false,
  drafts: false,
  schedule: false,
};

const caps = (c: Partial<Capabilities>): Capabilities => ({ ...none, ...c });

export const PLATFORMS: Record<PlatformId, PlatformInfo> = {
  gmail: {
    id: "gmail",
    name: "Gmail",
    shortName: "Gmail",
    category: "email",
    color: "#EA4335",
    support: "live",
    authMethod: "Google OAuth 2.0",
    summary: "Read, search, reply and send from any number of Gmail or Google Workspace accounts.",
    limitation:
      "Gmail read scopes are \u201crestricted\u201d: public launch needs Google verification plus an annual CASA security assessment. Until then, at most 100 test users can connect, and their authorizations expire after 7 days.",
    capabilities: caps({
      read: true,
      send: true,
      reply: true,
      compose: true,
      attachments: true,
      markRead: true,
      archive: true,
      threads: true,
      subjects: true,
      recipients: true,
      drafts: true,
      schedule: true,
    }),
    requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    multiAccount: true,
    docsUrl: "https://developers.google.com/gmail/api",
  },
  outlook: {
    id: "outlook",
    name: "Outlook",
    shortName: "Outlook",
    category: "email",
    color: "#0F6CBD",
    support: "live",
    authMethod: "Microsoft identity platform (OAuth 2.0) + Microsoft Graph",
    summary: "Outlook.com and Microsoft 365 mail via Microsoft Graph: read, reply, send, mark read and archive.",
    limitation:
      "Uses delegated Mail.ReadWrite and Mail.Send (no admin consent needed). Some organizations only allow apps from verified publishers; if yours does, an admin has to approve Orbit.",
    capabilities: caps({
      read: true,
      send: true,
      reply: true,
      compose: true,
      attachments: true,
      markRead: true,
      archive: true,
      threads: true,
      subjects: true,
      recipients: true,
      drafts: true,
      schedule: true,
    }),
    requiredEnv: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    multiAccount: true,
    docsUrl: "https://learn.microsoft.com/graph/api/resources/mail-api-overview",
  },
  imap: {
    id: "imap",
    name: "Other email (IMAP)",
    shortName: "IMAP",
    category: "email",
    color: "#6B6B6B",
    support: "planned",
    authMethod: "IMAP/SMTP with OAuth (XOAUTH2) or app passwords",
    summary: "Any provider that supports IMAP/SMTP.",
    limitation:
      "Not built yet. Orbit never stores your main account password. Only OAuth or provider app-specific passwords, encrypted at rest, will be supported.",
    capabilities: caps({
      read: true,
      send: true,
      reply: true,
      compose: true,
      attachments: true,
      markRead: true,
      archive: true,
      subjects: true,
      recipients: true,
    }),
    requiredEnv: [],
    multiAccount: true,
    docsUrl: "https://datatracker.ietf.org/doc/html/rfc9051",
  },
  slack: {
    id: "slack",
    name: "Slack",
    shortName: "Slack",
    category: "professional",
    color: "#4A154B",
    support: "live",
    authMethod: "Slack OAuth v2 (user token)",
    summary: "Channels, DMs and threads from your Slack workspaces. Reply as yourself.",
    limitation:
      "Slack throttles apps that aren't in the Slack Marketplace to 1 history request per minute (15 messages each), so initial sync is slow. A self-hosted Orbit can register as an internal app in your own workspace, which avoids the throttle.",
    capabilities: caps({
      read: true,
      send: true,
      reply: true,
      compose: true,
      markRead: true,
      threads: true,
      reactions: true,
      realtime: true,
    }),
    requiredEnv: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"],
    multiAccount: true,
    docsUrl: "https://api.slack.com/methods",
  },
  teams: {
    id: "teams",
    name: "Microsoft Teams",
    shortName: "Teams",
    category: "professional",
    color: "#5B5FC7",
    support: "live",
    authMethod: "Microsoft Graph (delegated Chat.ReadWrite + ChatMessage.Send)",
    summary: "1:1 and group chats in Microsoft Teams: read, reply, start 1:1 chats and mark read.",
    limitation:
      "Work or school accounts only (Graph doesn't support consumer Teams), subject to your organization's consent policy. Microsoft allows polling chats only once a day, so Orbit relies on change notifications for new messages.",
    capabilities: caps({ read: true, send: true, reply: true, compose: true, markRead: true, realtime: true }),
    requiredEnv: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    multiAccount: true,
    docsUrl: "https://learn.microsoft.com/graph/api/resources/chat",
  },
  telegram: {
    id: "telegram",
    name: "Telegram",
    shortName: "Telegram",
    category: "messaging",
    color: "#26A5E4",
    support: "live",
    authMethod: "Telegram Bot API (bot token from @BotFather)",
    summary: "Conversations people start with your Telegram bot. Replies are sent as the bot.",
    limitation:
      "The Bot API only sees chats with your bot. It can't read your personal chats, and a bot can't message someone first. Personal chats need Telegram's MTProto client API (phone login), which Orbit hasn't built yet.",
    capabilities: caps({ read: true, send: true, reply: true, attachments: true, realtime: true }),
    requiredEnv: [],
    multiAccount: true,
    docsUrl: "https://core.telegram.org/bots/api",
  },
  whatsapp: {
    id: "whatsapp",
    name: "WhatsApp",
    shortName: "WhatsApp",
    category: "messaging",
    color: "#25D366",
    support: "restricted",
    authMethod: "WhatsApp Business Platform (Cloud API)",
    summary: "Business numbers only, via the official Cloud API.",
    limitation:
      "WhatsApp has no API for personal accounts. Business numbers on the Cloud API can reply freely within 24 hours of the customer's last message; after that, only paid, pre-approved templates are allowed.",
    alternative: { label: "Open WhatsApp", url: "https://web.whatsapp.com" },
    capabilities: caps({ read: true, reply: true, attachments: true, readReceipts: true, realtime: true }),
    requiredEnv: ["WHATSAPP_APP_SECRET"],
    multiAccount: true,
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
  },
  discord: {
    id: "discord",
    name: "Discord",
    shortName: "Discord",
    category: "messaging",
    color: "#5865F2",
    support: "restricted",
    authMethod: "Discord bot (OAuth2 install)",
    summary: "Server channels where your Orbit bot is installed.",
    limitation:
      "No Discord OAuth scope gives an app access to your personal DMs, and automating a user account (\u201cself-bot\u201d) breaks Discord's Terms of Service. A bot can only see servers it's added to and DMs sent to it.",
    alternative: { label: "Open Discord", url: "https://discord.com/app" },
    capabilities: caps({ read: true, send: true, reply: true, threads: true, reactions: true, realtime: true }),
    requiredEnv: ["DISCORD_BOT_TOKEN"],
    multiAccount: true,
    docsUrl: "https://discord.com/developers/docs/intro",
  },
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    shortName: "LinkedIn",
    category: "professional",
    color: "#0A66C2",
    support: "restricted",
    authMethod: "LinkedIn partner program",
    summary: "Messaging access is limited to approved LinkedIn partners.",
    limitation:
      "LinkedIn's Messages API is limited to approved partners, and partner access is closed. Orbit can't read or send LinkedIn messages.",
    alternative: { label: "Open LinkedIn Messaging", url: "https://www.linkedin.com/messaging/" },
    capabilities: caps({}),
    requiredEnv: [],
    multiAccount: false,
    docsUrl: "https://learn.microsoft.com/linkedin/",
  },
  instagram: {
    id: "instagram",
    name: "Instagram",
    shortName: "Instagram",
    category: "social",
    color: "#E1306C",
    support: "restricted",
    authMethod: "Instagram API with Instagram Login (Meta app review)",
    summary: "DMs for Instagram professional (Business or Creator) accounts.",
    limitation:
      "Personal Instagram accounts have no messaging API. Professional accounts need Meta App Review. Replies are limited to 24 hours after the customer's last message (7 days with the Human Agent tag), and only the 20 most recent messages per conversation can be read.",
    alternative: { label: "Open Instagram", url: "https://www.instagram.com/direct/inbox/" },
    capabilities: caps({ read: true, reply: true, attachments: true, realtime: true }),
    requiredEnv: ["META_APP_ID", "META_APP_SECRET"],
    multiAccount: true,
    docsUrl: "https://developers.facebook.com/docs/instagram-platform",
  },
  messenger: {
    id: "messenger",
    name: "Messenger",
    shortName: "Messenger",
    category: "social",
    color: "#0866FF",
    support: "restricted",
    authMethod: "Messenger Platform (Facebook Page)",
    summary: "Messages sent to Facebook Pages you manage.",
    limitation:
      "Only Facebook Page conversations are available. Personal Messenger chats have no third-party API, and Page replies follow the 24-hour messaging window.",
    alternative: { label: "Open Messenger", url: "https://www.messenger.com" },
    capabilities: caps({ read: true, reply: true, attachments: true, readReceipts: true, realtime: true }),
    requiredEnv: ["META_APP_ID", "META_APP_SECRET"],
    multiAccount: true,
    docsUrl: "https://developers.facebook.com/docs/messenger-platform",
  },
};

export const PLATFORM_ORDER: PlatformId[] = [
  "gmail",
  "outlook",
  "imap",
  "slack",
  "teams",
  "telegram",
  "whatsapp",
  "discord",
  "linkedin",
  "instagram",
  "messenger",
];

export function getPlatform(id: PlatformId): PlatformInfo {
  return PLATFORMS[id];
}

export function capabilitiesFor(platform: PlatformId, overrides?: Partial<Capabilities>): Capabilities {
  return { ...PLATFORMS[platform].capabilities, ...overrides };
}

export const CATEGORY_LABEL: Record<PlatformCategory, string> = {
  email: "Email",
  messaging: "Messaging",
  professional: "Work & professional",
  social: "Social",
};
