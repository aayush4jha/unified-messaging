import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { connectorErrorResponse, requireUser } from "@/server/http";
import { clientKey, rateLimit } from "@/server/rate-limit";
import { sendMessage } from "@/server/sync";

const Body = z.object({
  clientId: z.string().min(8).max(100),
  accountId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  to: z.array(z.string().max(320)).max(100),
  cc: z.array(z.string().max(320)).max(100).optional(),
  subject: z.string().max(998).optional(),
  body: z.string().min(1).max(200_000),
  attachments: z.array(z.unknown()).max(0, "Attachments can't be sent from live accounts yet.").optional(),
});

/** Sends through the account's connector. Idempotent on clientId (see sendMessage). */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid message" }, { status: 400 });
  if (req.headers.get("idempotency-key") && req.headers.get("idempotency-key") !== parsed.data.clientId) return NextResponse.json({ error: "Idempotency key mismatch" }, { status: 400 });
  if (!rateLimit(clientKey(req, `send:${auth.user.id}`), 30, 60_000).ok) return NextResponse.json({ error: "You're sending very quickly. Wait a moment." }, { status: 429 });
  try {
    return NextResponse.json(await sendMessage(auth.user.id, parsed.data));
  } catch (e) {
    return connectorErrorResponse(e);
  }
}
