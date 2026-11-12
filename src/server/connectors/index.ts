import type { PlatformId } from "@/lib/types";
import { GmailConnector } from "./gmail";
import { ImapConnector } from "./imap";
import { InstagramConnector, MessengerConnector, WhatsAppConnector } from "./meta";
import { OutlookConnector } from "./outlook";
import { SlackConnector } from "./slack";
import { TeamsConnector } from "./teams";
import { TelegramConnector } from "./telegram";
import type { Connector } from "./types";

/** Implemented connectors. Platforms not listed here are planned or restricted (see src/lib/platforms.ts). */
export const CONNECTORS: Partial<Record<PlatformId, Connector>> = {
  gmail: GmailConnector,
  outlook: OutlookConnector,
  imap: ImapConnector,
  slack: SlackConnector,
  teams: TeamsConnector,
  telegram: TelegramConnector,
  whatsapp: WhatsAppConnector,
  messenger: MessengerConnector,
  instagram: InstagramConnector,
};

export function getConnector(platform: string): Connector | undefined {
  return CONNECTORS[platform as PlatformId];
}

export function publicBaseUrl(req?: Request): string {
  if (process.env.ORBIT_PUBLIC_URL) return process.env.ORBIT_PUBLIC_URL.replace(/\/$/, "");
  if (req) return new URL(req.url).origin;
  return "http://localhost:3000";
}

export function oauthRedirectUri(platform: string, req?: Request): string {
  return `${publicBaseUrl(req)}/api/connectors/${platform}/callback`;
}
