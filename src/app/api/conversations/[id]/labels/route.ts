import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { requireUser } from "@/server/http";
import { getUserClient } from "@/server/supabase";

const Body = z.object({ labelIds: z.array(z.string().uuid()).max(50) });

/** Replaces the set of labels on a conversation. */
export async function PUT(req: Request, ctx: RouteContext<"/api/conversations/[id]/labels">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid labels" }, { status: 400 });
  const db = await getUserClient();
  const del = await db.from("conversation_labels").delete().eq("conversation_id", id);
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });
  if (parsed.data.labelIds.length) {
    const ins = await db.from("conversation_labels").insert(parsed.data.labelIds.map((label_id) => ({ conversation_id: id, label_id, user_id: auth.user.id })));
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
