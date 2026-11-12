import { NextResponse } from "next/server";
import { safeEqual } from "@/server/crypto";
import { getServiceClient, supabaseConfigured } from "@/server/supabase";
import { ingestTelegramUpdate, type AccountRow } from "@/server/sync";

/** Telegram webhook. Verified with the per-account secret token Telegram echoes in a header. */
export async function POST(req: Request, ctx: RouteContext<"/api/webhooks/telegram/[accountId]">) {
  const { accountId } = await ctx.params;
  if (!supabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ ok: false }, { status: 503 });
  const db = getServiceClient();
  const { data: row } = await db.from("connected_accounts").select("*").eq("id", accountId).eq("platform_id", "telegram").maybeSingle();
  const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!row?.webhook_secret || !safeEqual(secret, row.webhook_secret)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    await ingestTelegramUpdate(db, row as AccountRow, await req.json());
  } catch (e) {
    console.error("[telegram webhook]", e);
    // 500 makes Telegram retry delivery later.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
