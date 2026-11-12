import { after, NextResponse } from "next/server";
import * as z from "zod/v4";
import { getConnector } from "@/server/connectors";
import { requireUser } from "@/server/http";
import { getServiceClient, getUserClient } from "@/server/supabase";
import { contextFor, loadAccount } from "@/server/sync";

const Patch = z
  .object({
    starred: z.boolean(),
    pinned: z.boolean(),
    important: z.boolean(),
    archived: z.boolean(),
    muted: z.boolean(),
    snoozedUntil: z.string().datetime().nullable(),
    unread: z.boolean(),
  })
  .partial();

/** Updates conversation state for the signed-in user and mirrors read/archive to the provider where supported. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  const p = parsed.data;
  const update: Record<string, unknown> = {};
  for (const k of ["starred", "pinned", "important", "archived", "muted"] as const) if (p[k] !== undefined) update[k] = p[k];
  if (p.snoozedUntil !== undefined) update.snoozed_until = p.snoozedUntil;
  if (p.unread !== undefined) update.unread_count = p.unread ? 1 : 0;

  const db = await getUserClient();
  const { data: conv, error } = await db.from("conversations").update(update).eq("id", id).select("id, external_id, account_id").single();
  if (error || !conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  if (p.unread === false || p.archived !== undefined) {
    after(async () => {
      const service = getServiceClient();
      const row = await loadAccount(service, auth.user.id, conv.account_id);
      const connector = row && getConnector(row.platform_id);
      if (!row || !connector) return;
      const c = contextFor(service, row);
      try {
        if (p.unread === false && connector.markRead) await connector.markRead(c, conv.external_id);
        if (p.archived !== undefined && connector.archive) await connector.archive(c, conv.external_id, p.archived);
      } catch (e) {
        console.error("[provider mirror]", e);
      }
    });
  }
  return NextResponse.json({ ok: true });
}
