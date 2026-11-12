import { after, NextResponse } from "next/server";
import { safeEqual } from "@/server/crypto";
import { getServiceClient } from "@/server/supabase";
import { syncAccount } from "@/server/sync";

/**
 * Cloud Pub/Sub push endpoint for Gmail `users.watch`. Configure the push
 * subscription URL as /api/webhooks/gmail?token=<GOOGLE_PUBSUB_VERIFICATION_TOKEN>.
 * The payload only says "mailbox X changed"; Orbit then runs a history sync.
 */
export async function POST(req: Request) {
  const expected = process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!expected || !safeEqual(token, expected)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "backend not configured" }, { status: 503 });

  const body = await req.json().catch(() => null);
  let email: string | undefined;
  try {
    email = JSON.parse(Buffer.from(String(body?.message?.data ?? ""), "base64").toString("utf8")).emailAddress?.toLowerCase();
  } catch {
    email = undefined;
  }
  // Ack malformed messages too (2xx), or Pub/Sub keeps redelivering them.
  if (!email) return new NextResponse(null, { status: 204 });

  const { data: accounts } = await getServiceClient().from("connected_accounts").select("id,user_id").eq("platform_id", "gmail").eq("handle", email).neq("status", "paused");
  for (const a of accounts ?? []) after(() => syncAccount(a.user_id, a.id, "webhook").catch((e) => console.error("[gmail push] sync", e)));
  return new NextResponse(null, { status: 204 });
}
