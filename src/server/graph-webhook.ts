import "server-only";
import { after, NextResponse } from "next/server";
import { safeEqual } from "./crypto";
import { getServiceClient } from "./supabase";
import { syncAccount } from "./sync";

/**
 * Microsoft Graph change notifications (Outlook mail, Teams chats): answers the
 * subscription validation handshake, verifies each notification's clientState
 * against the account's secret, then runs a sync after responding.
 */
export async function handleGraphNotification(req: Request, platform: "outlook" | "teams"): Promise<NextResponse> {
  const validationToken = new URL(req.url).searchParams.get("validationToken");
  if (validationToken) return new NextResponse(validationToken, { status: 200, headers: { "content-type": "text/plain" } });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "backend not configured" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { value?: { subscriptionId: string; clientState?: string }[] } | null;
  const db = getServiceClient();
  const seen = new Set<string>();
  for (const n of body?.value ?? []) {
    if (seen.has(n.subscriptionId)) continue;
    seen.add(n.subscriptionId);
    const { data: row } = await db.from("connected_accounts").select("id,user_id,webhook_secret").eq("platform_id", platform).eq("sync_cursor->subscription->>id", n.subscriptionId).maybeSingle();
    if (!row?.webhook_secret || !n.clientState || !safeEqual(n.clientState, row.webhook_secret)) continue; // not ours / forged
    after(() => syncAccount(row.user_id, row.id, "webhook").catch((e) => console.error(`[${platform} push] sync`, e)));
  }
  // Graph expects a fast 2xx; the sync runs after the response.
  return new NextResponse(null, { status: 202 });
}
