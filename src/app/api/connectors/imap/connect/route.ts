import { after, NextResponse } from "next/server";
import * as z from "zod/v4";
import { IMAP_PRESETS, verifyImapAccount, type ImapConfig } from "@/server/connectors/imap";
import { connectorErrorResponse, requireUser } from "@/server/http";
import { clientKey, rateLimit } from "@/server/rate-limit";
import { saveConnectedAccount, syncAccount } from "@/server/sync";

export const maxDuration = 60;

const Body = z.object({
  provider: z.enum(["icloud", "fastmail", "yahoo", "zoho", "aol", "custom"]),
  email: z.string().email().max(320),
  username: z.string().max(320).optional(),
  password: z.string().min(8).max(200),
  imapHost: z.string().max(253).optional(),
  imapPort: z.number().int().optional(),
  smtpHost: z.string().max(253).optional(),
  smtpPort: z.number().int().optional(),
});

/** Connects an IMAP/SMTP mailbox with an app-specific password (validated against both servers first). */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!rateLimit(clientKey(req, `imap-connect:${auth.user.id}`), 5, 10 * 60_000).ok) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid details" }, { status: 400 });
  const b = parsed.data;
  const preset = b.provider === "custom" ? null : IMAP_PRESETS[b.provider];
  const cfg: ImapConfig = {
    email: b.email.toLowerCase(),
    username: b.username || b.email,
    imapHost: preset?.imapHost ?? b.imapHost ?? "",
    imapPort: preset?.imapPort ?? b.imapPort ?? 993,
    smtpHost: preset?.smtpHost ?? b.smtpHost ?? "",
    smtpPort: preset?.smtpPort ?? b.smtpPort ?? 465,
  };
  try {
    await verifyImapAccount(cfg, b.password);
    const accountId = await saveConnectedAccount(auth.user.id, "imap", {
      externalAccountId: cfg.email,
      handle: cfg.email,
      label: b.provider === "custom" ? cfg.email.split("@")[1] : b.provider[0].toUpperCase() + b.provider.slice(1),
      scopes: ["imap", "smtp"],
      // The app password lives only in the encrypted token blob.
      tokens: { accessToken: b.password, extra: { email: cfg.email, username: cfg.username, imapHost: cfg.imapHost, imapPort: String(cfg.imapPort), smtpHost: cfg.smtpHost, smtpPort: String(cfg.smtpPort) } },
    });
    after(() => syncAccount(auth.user.id, accountId, "initial").catch((e) => console.error("[imap] initial sync", e)));
    return NextResponse.json({ accountId, handle: cfg.email });
  } catch (e) {
    return connectorErrorResponse(e);
  }
}
