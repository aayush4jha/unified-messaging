import { NextResponse } from "next/server";
import { normalizeSlackMessage, verifySlackSignature } from "@/server/connectors/slack";
import { getServiceClient } from "@/server/supabase";
import { contextFor, insertMessages, upsertConversation, type AccountRow } from "@/server/sync";

/** Slack Events API endpoint. Requests are verified with the app's signing secret. */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret || !verifySlackSignature({ signingSecret: secret, timestamp: req.headers.get("x-slack-request-timestamp"), signature: req.headers.get("x-slack-signature"), rawBody: raw })) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const body = JSON.parse(raw);
  if (body.type === "url_verification") return NextResponse.json({ challenge: body.challenge });
  if (body.type !== "event_callback" || body.event?.type !== "message" || (body.event.subtype && body.event.subtype !== "file_share")) return NextResponse.json({ ok: true });

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "backend not configured" }, { status: 503 });
  const db = getServiceClient();
  const ids: string[] = (body.authorizations ?? []).map((a: { team_id: string; user_id: string }) => `${a.team_id}:${a.user_id}`);
  if (!ids.length) return NextResponse.json({ ok: true });
  const { data: rows } = await db.from("connected_accounts").select("*").eq("platform_id", "slack").in("external_account_id", ids);
  for (const row of (rows ?? []) as AccountRow[]) {
    try {
      const ctx = contextFor(db, row);
      const ev = body.event;
      const convId = await upsertConversation(db, row, {
        externalId: ev.channel,
        kind: ev.channel_type === "im" ? "dm" : ev.channel_type === "mpim" ? "group" : "channel",
        title: ev.channel,
        participants: [],
        unreadCount: 0,
        lastMessageAt: new Date(Number(ev.ts) * 1000).toISOString(),
      });
      const msg = await normalizeSlackMessage(ctx, ev);
      const inserted = await insertMessages(db, row, convId, [msg]);
      if (inserted && msg.authorExternalId !== "me") await db.rpc("increment_unread", { conv_id: convId });
    } catch (e) {
      console.error("[slack webhook]", e);
    }
  }
  return NextResponse.json({ ok: true });
}
