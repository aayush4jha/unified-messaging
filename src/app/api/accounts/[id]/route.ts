import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { requireUser } from "@/server/http";
import { getServiceClient, getUserClient } from "@/server/supabase";
import { disconnectAccount } from "@/server/sync";

const Patch = z.object({ label: z.string().min(1).max(60), aiEnabled: z.boolean(), notificationsEnabled: z.boolean(), isDefaultSender: z.boolean(), paused: z.boolean() }).partial();

export async function PATCH(req: Request, ctx: RouteContext<"/api/accounts/[id]">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  const p = parsed.data;
  const db = await getUserClient();
  const update: Record<string, unknown> = {};
  if (p.label !== undefined) update.label = p.label;
  if (p.aiEnabled !== undefined) update.ai_enabled = p.aiEnabled;
  if (p.notificationsEnabled !== undefined) update.notifications_enabled = p.notificationsEnabled;
  if (p.paused !== undefined) update.status = p.paused ? "paused" : "connected";
  if (p.isDefaultSender) {
    const { data: acc } = await db.from("connected_accounts").select("platform_id").eq("id", id).single();
    if (acc) await db.from("connected_accounts").update({ is_default_sender: false }).eq("platform_id", acc.platform_id);
    update.is_default_sender = true;
  }
  const { error } = await db.from("connected_accounts").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (p.aiEnabled !== undefined) await getServiceClient().from("audit_logs").insert({ user_id: auth.user.id, action: "ai.toggle", target: id, metadata: { enabled: p.aiEnabled } });
  return NextResponse.json({ ok: true });
}

/** Disconnect: revoke provider access and permanently delete everything synced from the account. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/accounts/[id]">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const ok = await disconnectAccount(auth.user.id, id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Account not found" }, { status: 404 });
}
