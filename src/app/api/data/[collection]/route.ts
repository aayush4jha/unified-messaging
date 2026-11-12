import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { requireUser } from "@/server/http";
import { getUserClient } from "@/server/supabase";

/**
 * Batch persistence for user-authored workspace data in live mode.
 * POST { upserts: [...], deletes: [ids] }. Every query runs as the signed-in
 * user, so Row Level Security scopes it to their rows.
 */

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });

const Collections = {
  reminders: {
    table: "reminders",
    key: "id",
    item: z.object({
      id: uuid,
      kind: z.enum(["reminder", "follow_up", "task", "awaiting_response"]),
      title: z.string().min(1).max(500),
      note: z.string().max(2000).optional(),
      conversationId: uuid.optional(),
      contactId: uuid.optional(),
      dueAt: iso.optional(),
      completedAt: iso.optional(),
      source: z.enum(["user", "suggestion"]).optional(),
    }),
    toRow: (r: Record<string, unknown>) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      note: r.note ?? null,
      conversation_id: r.conversationId ?? null,
      contact_id: r.contactId ?? null,
      due_at: r.dueAt ?? null,
      completed_at: r.completedAt ?? null,
      source: r.source ?? "user",
    }),
  },
  notes: {
    table: "notes",
    key: "conversation_id",
    item: z.object({ conversationId: uuid, body: z.string().max(20_000), updatedAt: iso.optional() }),
    toRow: (r: Record<string, unknown>) => ({ conversation_id: r.conversationId, body: r.body, updated_at: r.updatedAt ?? new Date().toISOString() }),
  },
  labels: {
    table: "labels",
    key: "id",
    item: z.object({ id: uuid, name: z.string().min(1).max(60), hue: z.number().int().min(0).max(360) }),
    toRow: (r: Record<string, unknown>) => ({ id: r.id, name: r.name, hue: r.hue }),
  },
  drafts: {
    table: "drafts",
    key: "id",
    item: z.object({
      id: uuid,
      accountId: uuid,
      conversationId: uuid.optional(),
      to: z.array(z.string().max(320)).max(100),
      subject: z.string().max(998).optional(),
      body: z.string().max(200_000),
      updatedAt: iso.optional(),
    }),
    toRow: (r: Record<string, unknown>) => ({
      id: r.id,
      account_id: r.accountId,
      conversation_id: r.conversationId ?? null,
      to_addrs: r.to,
      subject: r.subject ?? null,
      body: r.body,
      updated_at: r.updatedAt ?? new Date().toISOString(),
    }),
  },
  scheduled: {
    table: "scheduled_messages",
    key: "id",
    item: z.object({
      id: uuid,
      accountId: uuid,
      conversationId: uuid.optional(),
      to: z.array(z.string().max(320)).max(100),
      subject: z.string().max(998).optional(),
      body: z.string().min(1).max(200_000),
      sendAt: iso,
    }),
    toRow: (r: Record<string, unknown>) => ({
      id: r.id,
      client_id: `sched_${r.id}`,
      account_id: r.accountId,
      conversation_id: r.conversationId ?? null,
      to_addrs: r.to,
      subject: r.subject ?? null,
      body: r.body,
      send_at: r.sendAt,
      status: "scheduled",
    }),
  },
  rules: {
    table: "priority_rules",
    key: "id",
    item: z.object({ id: uuid, kind: z.enum(["sender", "keyword", "account", "platform"]), value: z.string().min(1).max(200), effect: z.enum(["boost", "lower"]), enabled: z.boolean() }),
    toRow: (r: Record<string, unknown>) => ({ id: r.id, kind: r.kind, value: r.value, effect: r.effect, enabled: r.enabled }),
  },
  contacts: {
    table: "contacts",
    key: "id",
    // Editable fields only. Identities change through merge/unmerge or sync, never directly.
    item: z.object({ id: uuid, name: z.string().min(1).max(200), company: z.string().max(200).optional(), title: z.string().max(200).optional(), notes: z.string().max(20_000), vip: z.boolean() }),
    toRow: (r: Record<string, unknown>) => ({ id: r.id, name: r.name, company: r.company ?? null, title: r.title ?? null, notes: r.notes, vip: r.vip, updated_at: new Date().toISOString() }),
    updateOnly: true,
  },
} as const;

type CollectionName = keyof typeof Collections;

const Body = z.object({ upserts: z.array(z.unknown()).max(500).default([]), deletes: z.array(z.string()).max(500).default([]) });

export async function POST(req: Request, ctx: RouteContext<"/api/data/[collection]">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { collection } = await ctx.params;
  const spec = Collections[collection as CollectionName];
  if (!spec) return NextResponse.json({ error: "Unknown collection" }, { status: 404 });

  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const items: Record<string, unknown>[] = [];
  for (const raw of body.data.upserts) {
    const parsed = (spec.item as z.ZodType).safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: `Invalid ${collection} item`, details: parsed.error.issues.slice(0, 3) }, { status: 400 });
    items.push({ ...spec.toRow(parsed.data as Record<string, unknown>), user_id: auth.user.id });
  }
  const deletes = body.data.deletes.filter((d) => uuid.safeParse(d).success);

  const db = await getUserClient();
  if (items.length) {
    if ("updateOnly" in spec && spec.updateOnly) {
      for (const it of items) {
        const { id, ...rest } = it;
        const { error } = await db.from(spec.table).update(rest).eq("id", id as string);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      }
    } else {
      const { error } = await db.from(spec.table).upsert(items, { onConflict: spec.key });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }
  if (deletes.length) {
    let q = db.from(spec.table).delete().in(spec.key, deletes);
    // A scheduled message that's already sending/sent can't be cancelled.
    if (spec.table === "scheduled_messages") q = q.eq("status", "scheduled");
    const { error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, upserted: items.length, deleted: deletes.length });
}
