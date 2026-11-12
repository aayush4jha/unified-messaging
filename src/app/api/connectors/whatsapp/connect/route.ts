import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { whatsappIdentity } from "@/server/connectors/meta";
import { connectorErrorResponse, requireUser } from "@/server/http";
import { saveConnectedAccount } from "@/server/sync";

const Body = z.object({ token: z.string().min(20).max(1000), phoneNumberId: z.string().regex(/^\d{6,20}$/, "Phone number ID is the numeric ID from WhatsApp Manager / the app dashboard.") });

/**
 * Connects a WhatsApp Business number on the Cloud API with a system-user
 * access token. (Onboarding other businesses needs Meta's Embedded Signup as
 * a Tech Provider; this covers your own business.)
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid details" }, { status: 400 });
  try {
    const identity = await whatsappIdentity(parsed.data.token, parsed.data.phoneNumberId);
    const accountId = await saveConnectedAccount(auth.user.id, "whatsapp", identity, { capability_overrides: { compose: false } });
    return NextResponse.json({ accountId, handle: identity.handle });
  } catch (e) {
    return connectorErrorResponse(e);
  }
}
