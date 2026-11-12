import { NextResponse } from "next/server";
import { requireUser } from "@/server/http";
import { pushToUser, vapidConfig } from "@/server/push";
import { rateLimit } from "@/server/rate-limit";
import { getServiceClient } from "@/server/supabase";

/** Sends a test notification to every device the user turned push on for. */
export async function POST() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!vapidConfig()) return NextResponse.json({ error: "Push notifications aren't configured on this server.", code: "push_unconfigured" }, { status: 503 });
  const limit = rateLimit(`push-test:${auth.user.id}`, 5, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many test notifications. Try again in a minute." }, { status: 429, headers: { "retry-after": String(limit.retryAfter) } });
  const result = await pushToUser(getServiceClient(), auth.user.id, { title: "Orbit", body: "Notifications are on for this device.", url: "/settings?tab=mobile", tag: "orbit-test" });
  return NextResponse.json(result);
}
