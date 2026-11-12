import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { requireUser } from "@/server/http";
import { getUserClient } from "@/server/supabase";

const Body = z.object({ primaryId: z.string().uuid(), secondaryId: z.string().uuid() });

/**
 * Merges `secondary` into `primary`. Reversible: identities remember their
 * original contact, and the secondary record stays (merged_into = primary).
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || parsed.data.primaryId === parsed.data.secondaryId) return NextResponse.json({ error: "Invalid merge" }, { status: 400 });
  const { primaryId, secondaryId } = parsed.data;
  const db = await getUserClient();

  const { data: both } = await db.from("contacts").select("id, vip, notes, merged_into").in("id", [primaryId, secondaryId]);
  const primary = both?.find((c) => c.id === primaryId);
  const secondary = both?.find((c) => c.id === secondaryId);
  if (!primary || !secondary || primary.merged_into || secondary.merged_into) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const { data: identities } = await db.from("contact_identities").select("id, original_contact_id").eq("contact_id", secondaryId);
  for (const idn of identities ?? []) {
    await db.from("contact_identities").update({ contact_id: primaryId, original_contact_id: idn.original_contact_id ?? secondaryId }).eq("id", idn.id);
  }
  await Promise.all([
    db.from("conversation_participants").update({ contact_id: primaryId }).eq("contact_id", secondaryId),
    db.from("conversations").update({ contact_id: primaryId }).eq("contact_id", secondaryId),
    db.from("reminders").update({ contact_id: primaryId }).eq("contact_id", secondaryId),
    db.from("contacts").update({ merged_into: primaryId }).eq("merged_into", secondaryId),
  ]);
  await db.from("contacts").update({ merged_into: primaryId }).eq("id", secondaryId);
  await db
    .from("contacts")
    .update({ vip: primary.vip || secondary.vip, notes: [primary.notes, secondary.notes].filter(Boolean).join("\n\n"), updated_at: new Date().toISOString() })
    .eq("id", primaryId);
  await db.from("audit_logs").insert({ user_id: auth.user.id, action: "contact.merge", target: primaryId, metadata: { merged: secondaryId } });
  return NextResponse.json({ ok: true });
}
