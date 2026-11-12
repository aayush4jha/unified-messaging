import { NextResponse } from "next/server";
import type { PlatformId } from "@/lib/types";
import { requireUser } from "@/server/http";
import { getUserClient } from "@/server/supabase";
import { rowToAccount, rowToConversation } from "@/server/sync";

const ACCOUNT_COLUMNS = "id,user_id,platform_id,external_account_id,label,handle,status,status_message,scopes,is_default_sender,ai_enabled,notifications_enabled,capability_overrides,last_synced_at,created_at";

/** Everything the client needs to render a live workspace. Runs as the user (RLS). */
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const db = await getUserClient();
  const [accounts, conversations, labels, convLabels, reminders, notes, notifications] = await Promise.all([
    db.from("connected_accounts").select(ACCOUNT_COLUMNS).order("created_at"),
    db.from("conversations").select("*, conversation_participants(external_id,name,handle,contact_id)").order("last_message_at", { ascending: false }).limit(400),
    db.from("labels").select("*"),
    db.from("conversation_labels").select("conversation_id,label_id"),
    db.from("reminders").select("*").order("due_at"),
    db.from("notes").select("*"),
    db.from("notifications").select("*").order("created_at", { ascending: false }).limit(100),
  ]);
  const err = [accounts, conversations].find((r) => r.error);
  if (err?.error) return NextResponse.json({ error: err.error.message }, { status: 500 });

  const platformByAccount = new Map((accounts.data ?? []).map((a) => [a.id as string, a.platform_id as PlatformId]));
  const labelsByConv = new Map<string, string[]>();
  for (const cl of convLabels.data ?? []) labelsByConv.set(cl.conversation_id, [...(labelsByConv.get(cl.conversation_id) ?? []), cl.label_id]);

  return NextResponse.json({
    accounts: (accounts.data ?? []).map(rowToAccount),
    conversations: (conversations.data ?? []).map((c) => ({ ...rowToConversation(c, platformByAccount.get(c.account_id)!, c.conversation_participants ?? []), labels: labelsByConv.get(c.id) ?? [] })),
    labels: (labels.data ?? []).map((l) => ({ id: l.id, name: l.name, hue: l.hue })),
    reminders: (reminders.data ?? []).map((r) => ({ id: r.id, kind: r.kind, title: r.title, note: r.note ?? undefined, conversationId: r.conversation_id ?? undefined, contactId: r.contact_id ?? undefined, dueAt: r.due_at ?? undefined, completedAt: r.completed_at ?? undefined, createdAt: r.created_at, source: r.source })),
    notes: Object.fromEntries((notes.data ?? []).map((n) => [n.conversation_id, { conversationId: n.conversation_id, body: n.body, updatedAt: n.updated_at }])),
    notifications: (notifications.data ?? []).map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, createdAt: n.created_at, read: n.read, conversationId: n.conversation_id ?? undefined, accountId: n.account_id ?? undefined, reminderId: n.reminder_id ?? undefined })),
  });
}
