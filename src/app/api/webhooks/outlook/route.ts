import { after, NextResponse } from "next/server";
import { safeEqual } from "@/server/crypto";
import { getServiceClient } from "@/server/supabase";
import { syncAccount } from "@/server/sync";

/**
 * Microsoft Graph change notifications for Outlook mail. Handles the
 * subscription validation handshake, verifies each notification's clientState
 * against the account's secret, then runs a delta sync.
 */
export async function POST(req: Request) {
  const validationToken = new URL(req.url).searchParams.get("validationToken");
  if (validationToken) return new NextResponse(validationToken, { status: 200, headers: { "content-type": "text/plain" } });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "backend not configured" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { value?: { subscriptionId: string; clientState?: string }[] } | null;
  const db = getServiceClient();
  const seen = new Set<string>();
  for (const n of body?.value ?? []) {
    if (seen.has(n.subscriptionId)) continue;
    seen.add(n.subscriptionId);
    const { data: row } = await db.from("connected_accounts").select("id,user_id,webhook_secret").eq("platform_id", "outlook").eq("sync_cursor->subscription->>id", n.subscriptionId).maybeSingle();
    if (!row?.webhook_secret || !n.clientState || !safeEqual(n.clientState, row.webhook_secret)) continue; // not ours / forged
    after(() => syncAccount(row.user_id, row.id, "incremental").catch((e) => console.error("[outlook push] sync", e)));
  }
  // Graph expects a fast 2xx; the sync runs after the response.
  return new NextResponse(null, { status: 202 });
}
