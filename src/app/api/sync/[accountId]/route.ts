import { NextResponse } from "next/server";
import { connectorErrorResponse, requireUser } from "@/server/http";
import { clientKey, rateLimit } from "@/server/rate-limit";
import { syncAccount } from "@/server/sync";

export const maxDuration = 60;

export async function POST(req: Request, ctx: RouteContext<"/api/sync/[accountId]">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { accountId } = await ctx.params;
  if (!rateLimit(clientKey(req, `sync:${accountId}`), 4, 60_000).ok) return NextResponse.json({ error: "Sync was just run. Try again in a minute." }, { status: 429 });
  try {
    return NextResponse.json({ ok: true, stats: await syncAccount(auth.user.id, accountId) });
  } catch (e) {
    return connectorErrorResponse(e);
  }
}
