import { NextResponse } from "next/server";
import { requireUser } from "@/server/http";
import { getUserClient } from "@/server/supabase";
import { rowToMessage } from "@/server/sync";

export async function GET(_req: Request, ctx: RouteContext<"/api/conversations/[id]/messages">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const db = await getUserClient();
  const { data, error } = await db.from("messages").select("*").eq("conversation_id", id).order("sent_at").limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: (data ?? []).map(rowToMessage) });
}
