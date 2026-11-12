import { connection, NextResponse } from "next/server";
import * as z from "zod/v4";
import { requireUser } from "@/server/http";
import { isAllowedPushEndpoint, vapidConfig } from "@/server/push";
import { getServiceClient, getUserClient, supabaseConfigured } from "@/server/supabase";

/** Whether this deployment can send Web Push, and the public key browsers subscribe with. */
export async function GET() {
  await connection();
  const vapid = vapidConfig();
  return NextResponse.json({ configured: Boolean(vapid && supabaseConfigured()), publicKey: vapid?.publicKey ?? null });
}

const Subscription = z.object({
  endpoint: z.string().url().max(1024),
  keys: z.object({ p256dh: z.string().min(16).max(256), auth: z.string().min(8).max(64) }),
});
const Body = z.object({
  subscription: Subscription,
  /** Endpoint this one replaces (pushsubscriptionchange). */
  replaces: z.string().max(1024).optional(),
  timeZone: z.string().max(64).optional(),
});

/** Registers this device for push. Endpoints are bound to the signed-in user (moved if the device changed hands). */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!vapidConfig()) return NextResponse.json({ error: "Push notifications aren't configured on this server.", code: "push_unconfigured" }, { status: 503 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const { subscription, replaces, timeZone } = parsed.data;
  if (!isAllowedPushEndpoint(subscription.endpoint)) return NextResponse.json({ error: "Unsupported push service" }, { status: 400 });
  let zone: string | null = null;
  try {
    if (timeZone) zone = new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
  } catch {
    zone = null;
  }

  const db = getServiceClient();
  if (replaces && replaces !== subscription.endpoint) await db.from("push_subscriptions").delete().eq("endpoint", replaces).eq("user_id", auth.user.id);
  const { error } = await db.from("push_subscriptions").upsert(
    {
      user_id: auth.user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      time_zone: zone,
      failure_count: 0,
    },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Turns push off for this device. */
export async function DELETE(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const parsed = z.object({ endpoint: z.string().max(1024) }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  const db = await getUserClient();
  await db.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}
