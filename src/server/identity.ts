import type { PlatformId } from "@/lib/types";

/**
 * The identity a participant proves: an email address (platform-agnostic), or a
 * platform-scoped handle. Matching is exact on this identity. Orbit never
 * merges people on display name alone; that's left to the user.
 */
export function identityFor(platform: PlatformId, accountExternalId: string, p: { externalId: string; handle?: string }): { kind: "email" | "handle"; platform_id: string | null; value: string } | null {
  if (platform === "gmail" || platform === "outlook" || platform === "imap") {
    const email = (p.handle ?? p.externalId).trim().toLowerCase();
    return /@/.test(email) ? { kind: "email", platform_id: null, value: email } : null;
  }
  if (platform === "slack") return { kind: "handle", platform_id: "slack", value: `${accountExternalId.split(":")[0]}:${p.externalId}` };
  if (platform === "telegram") return { kind: "handle", platform_id: "telegram", value: p.externalId };
  return p.externalId ? { kind: "handle", platform_id: platform, value: p.externalId } : null;
}

