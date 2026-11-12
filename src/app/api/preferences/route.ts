import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { requireUser } from "@/server/http";
import { getUserClient } from "@/server/supabase";

const Body = z.object({
  prefs: z.record(z.string(), z.unknown()),
  aiEnabled: z.boolean(),
  retentionDays: z.number().int().min(1).max(3650),
});

/** Stores the user's preferences so they follow them across devices. */
export async function PUT(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid preferences" }, { status: 400 });
  const db = await getUserClient();
  const { error } = await db.from("user_preferences").upsert({
    user_id: auth.user.id,
    prefs: parsed.data.prefs,
    ai_enabled: parsed.data.aiEnabled,
    retention_days: parsed.data.retentionDays,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
