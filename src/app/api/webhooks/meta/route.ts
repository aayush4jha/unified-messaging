import { NextResponse } from "next/server";
import { safeEqual } from "@/server/crypto";
import { normalizeMessagingEvent, normalizeWhatsApp, verifyMetaSignature, type MetaMessagingEvent, type WhatsAppValue } from "@/server/connectors/meta";
import { getServiceClient } from "@/server/supabase";
import { applyStatuses, ingestEvent, type AccountRow } from "@/server/sync";

/**
 * One webhook for Meta products: Facebook Pages (object "page"), Instagram
 * ("instagram") and WhatsApp Business ("whatsapp_business_account").
 * GET answers the subscription handshake; POST requires X-Hub-Signature-256.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (u.searchParams.get("hub.mode") === "subscribe" && expected && safeEqual(u.searchParams.get("hub.verify_token") ?? "", expected)) {
    return new NextResponse(u.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), [process.env.META_APP_SECRET, process.env.INSTAGRAM_APP_SECRET])) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "backend not configured" }, { status: 503 });
  const body = JSON.parse(raw) as { object: string; entry: { id: string; messaging?: MetaMessagingEvent[]; changes?: { field: string; value: WhatsAppValue }[] }[] };
  const db = getServiceClient();
  const accountsFor = async (platform: string, externalId: string) =>
    ((await db.from("connected_accounts").select("*").eq("platform_id", platform).eq("external_account_id", externalId)).data ?? []) as AccountRow[];

  try {
    for (const entry of body.entry ?? []) {
      if (body.object === "page" || body.object === "instagram") {
        const platform = body.object === "page" ? "messenger" : "instagram";
        for (const row of await accountsFor(platform, entry.id)) {
          for (const ev of entry.messaging ?? []) {
            const n = normalizeMessagingEvent(ev, entry.id, platform);
            if (n) await ingestEvent(db, row, n);
          }
        }
      } else if (body.object === "whatsapp_business_account") {
        for (const change of entry.changes ?? []) {
          if (change.field !== "messages") continue;
          const { messages, statuses } = normalizeWhatsApp(change.value);
          for (const row of await accountsFor("whatsapp", change.value.metadata.phone_number_id)) {
            for (const n of messages) await ingestEvent(db, row, n);
            if (statuses.length) await applyStatuses(db, row, statuses);
          }
        }
      }
    }
  } catch (e) {
    console.error("[meta webhook]", e);
    return NextResponse.json({ ok: false }, { status: 500 }); // Meta retries
  }
  return NextResponse.json({ ok: true });
}
