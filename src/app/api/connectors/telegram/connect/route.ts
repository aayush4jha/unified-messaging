import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { randomToken } from "@/server/crypto";
import { publicBaseUrl } from "@/server/connectors";
import { BOT_TOKEN_RE, telegramGetMe, telegramSetWebhook } from "@/server/connectors/telegram";
import { connectorErrorResponse, requireUser } from "@/server/http";
import { getServiceClient } from "@/server/supabase";
import { saveConnectedAccount } from "@/server/sync";

const Body = z.object({ token: z.string().regex(BOT_TOKEN_RE, "That doesn't look like a bot token from @BotFather.") });

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid token" }, { status: 400 });

  try {
    const bot = await telegramGetMe(parsed.data.token);
    if (!bot.is_bot) return NextResponse.json({ error: "That token doesn't belong to a bot." }, { status: 400 });
    const secret = randomToken(24);
    const accountId = await saveConnectedAccount(
      auth.user.id,
      "telegram",
      { externalAccountId: String(bot.id), handle: `@${bot.username}`, label: bot.first_name, tokens: { accessToken: parsed.data.token }, scopes: ["bot"] },
      { webhook_secret: secret, capability_overrides: { compose: false } },
    );
    if (process.env.ORBIT_PUBLIC_URL) {
      await telegramSetWebhook(parsed.data.token, `${publicBaseUrl(req)}/api/webhooks/telegram/${accountId}`, secret);
    } else {
      // Local development: no public URL for webhooks; the sync job polls getUpdates instead.
      await getServiceClient().from("connected_accounts").update({ sync_cursor: { mode: "polling" } }).eq("id", accountId);
    }
    return NextResponse.json({ accountId, username: bot.username });
  } catch (e) {
    return connectorErrorResponse(e);
  }
}
