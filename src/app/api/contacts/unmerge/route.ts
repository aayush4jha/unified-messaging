import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { requireUser } from "@/server/http";
import { getUserClient } from "@/server/supabase";

const Body = z.object({ primaryId: z.string().uuid(), mergedId: z.string().uuid() });

/** Reverses a merge: identities, participants and 1:1 conversations move back. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { primaryId, mergedId } = parsed.data;
  const db = await getUserClient();

  const { data: merged } = await db.from("contacts").select("id, merged_into").eq("id", mergedId).maybeSingle();
  if (!merged || merged.merged_into !== primaryId) return NextResponse.json({ error: "Not a merged record of this contact" }, { status: 404 });

  const { data: identities } = await db.from("contact_identities").select("id, kind, platform_id, value").eq("contact_id", primaryId).eq("original_contact_id", mergedId);
  for (const idn of identities ?? []) {
    await db.from("contact_identities").update({ contact_id: mergedId, original_contact_id: null }).eq("id", idn.id);
    // Participants reached through this identity follow it back.
    if (idn.kind === "email") await db.from("conversation_participants").update({ contact_id: mergedId }).eq("contact_id", primaryId).ilike("handle", idn.value);
    else {
      const externalId = idn.platform_id === "slack" ? idn.value.split(":")[1] : idn.value;
      await db.from("conversation_participants").update({ contact_id: mergedId }).eq("contact_id", primaryId).eq("external_id", externalId);
    }
  }
  const { data: moved } = await db.from("conversation_participants").select("conversation_id").eq("contact_id", mergedId);
  const convIds = Array.from(new Set((moved ?? []).map((m) => m.conversation_id)));
  if (convIds.length) await db.from("conversations").update({ contact_id: mergedId }).in("id", convIds).eq("contact_id", primaryId);
  await db.from("contacts").update({ merged_into: null }).eq("id", mergedId);
  await db.from("audit_logs").insert({ user_id: auth.user.id, action: "contact.unmerge", target: primaryId, metadata: { restored: mergedId } });
  return NextResponse.json({ ok: true });
}
