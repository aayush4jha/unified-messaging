import { NextResponse } from "next/server";
import type { Contact, ContactHandle, PlatformId } from "@/lib/types";
import { requireUser } from "@/server/http";
import { getUserClient } from "@/server/supabase";
import { rowToAccount, rowToConversation } from "@/server/sync";

const ACCOUNT_COLUMNS = "id,user_id,platform_id,external_account_id,label,handle,status,status_message,scopes,is_default_sender,ai_enabled,notifications_enabled,capability_overrides,last_synced_at,created_at";

interface IdentityRow {
  kind: "email" | "phone" | "handle";
  platform_id: PlatformId | null;
  value: string;
  display: string | null;
  account_id: string | null;
  original_contact_id: string | null;
}
interface ContactRow {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  notes: string;
  vip: boolean;
  avatar_hue: number;
  merged_into: string | null;
  contact_identities: IdentityRow[];
}

/** Everything the client needs to render a live workspace. Runs as the user (RLS). */
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const db = await getUserClient();
  const [accounts, conversations, labels, convLabels, reminders, notes, notifications, contacts, drafts, scheduled, rules, prefs] = await Promise.all([
    db.from("connected_accounts").select(ACCOUNT_COLUMNS).order("created_at"),
    db.from("conversations").select("*, conversation_participants(external_id,name,handle,contact_id)").order("last_message_at", { ascending: false }).limit(400),
    db.from("labels").select("*"),
    db.from("conversation_labels").select("conversation_id,label_id"),
    db.from("reminders").select("*").order("due_at"),
    db.from("notes").select("*"),
    db.from("notifications").select("*").order("created_at", { ascending: false }).limit(100),
    db.from("contacts").select("id,name,company,title,notes,vip,avatar_hue,merged_into,contact_identities(kind,platform_id,value,display,account_id,original_contact_id)").limit(2000),
    db.from("drafts").select("*").order("updated_at", { ascending: false }),
    db.from("scheduled_messages").select("*").eq("status", "scheduled").order("send_at"),
    db.from("priority_rules").select("*"),
    db.from("user_preferences").select("prefs,ai_enabled,retention_days").maybeSingle(),
  ]);
  const err = [accounts, conversations].find((r) => r.error);
  if (err?.error) return NextResponse.json({ error: err.error.message }, { status: 500 });

  const accountRows = accounts.data ?? [];
  const platformByAccount = new Map(accountRows.map((a) => [a.id as string, a.platform_id as PlatformId]));
  const labelsByConv = new Map<string, string[]>();
  for (const cl of convLabels.data ?? []) labelsByConv.set(cl.conversation_id, [...(labelsByConv.get(cl.conversation_id) ?? []), cl.label_id]);

  return NextResponse.json({
    accounts: accountRows.map(rowToAccount),
    conversations: (conversations.data ?? []).map((c) => ({ ...rowToConversation(c, platformByAccount.get(c.account_id)!, c.conversation_participants ?? []), labels: labelsByConv.get(c.id) ?? [] })),
    labels: (labels.data ?? []).map((l) => ({ id: l.id, name: l.name, hue: l.hue })),
    reminders: (reminders.data ?? []).map((r) => ({ id: r.id, kind: r.kind, title: r.title, note: r.note ?? undefined, conversationId: r.conversation_id ?? undefined, contactId: r.contact_id ?? undefined, dueAt: r.due_at ?? undefined, completedAt: r.completed_at ?? undefined, createdAt: r.created_at, source: r.source })),
    notes: Object.fromEntries((notes.data ?? []).map((n) => [n.conversation_id, { conversationId: n.conversation_id, body: n.body, updatedAt: n.updated_at }])),
    notifications: (notifications.data ?? []).map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, createdAt: n.created_at, read: n.read, conversationId: n.conversation_id ?? undefined, accountId: n.account_id ?? undefined, reminderId: n.reminder_id ?? undefined })),
    contacts: toContacts((contacts.data ?? []) as unknown as ContactRow[], platformByAccount),
    drafts: (drafts.data ?? []).map((d) => ({ id: d.id, accountId: d.account_id, conversationId: d.conversation_id ?? undefined, to: d.to_addrs ?? [], subject: d.subject ?? undefined, body: d.body, updatedAt: d.updated_at })),
    scheduled: (scheduled.data ?? []).map((m) => ({ id: m.id, accountId: m.account_id, conversationId: m.conversation_id ?? undefined, to: m.to_addrs ?? [], subject: m.subject ?? undefined, body: m.body, sendAt: m.send_at, createdAt: m.created_at })),
    priorityRules: (rules.data ?? []).map((r) => ({ id: r.id, kind: r.kind, value: r.value, effect: r.effect, enabled: r.enabled })),
    preferences: prefs.data ? { ...(prefs.data.prefs as object), aiEnabled: prefs.data.ai_enabled, retentionDays: prefs.data.retention_days } : null,
  });
}

/** Builds client contacts: merged records are folded into their primary as `mergedFrom`. */
function toContacts(rows: ContactRow[], platformByAccount: Map<string, PlatformId>): Contact[] {
  const toParts = (ids: IdentityRow[]) => {
    const emails: string[] = [];
    const phones: string[] = [];
    const handles: ContactHandle[] = [];
    for (const i of ids) {
      if (i.kind === "email") {
        emails.push(i.value);
        const platform = i.account_id ? platformByAccount.get(i.account_id) : undefined;
        if (platform) handles.push({ platform, value: i.value, accountId: i.account_id ?? undefined });
      } else if (i.kind === "phone") phones.push(i.value);
      else if (i.platform_id) handles.push({ platform: i.platform_id, value: i.display ?? i.value, accountId: i.account_id ?? undefined });
    }
    return { emails, phones, handles };
  };
  const merged = rows.filter((r) => r.merged_into);
  return rows
    .filter((r) => !r.merged_into)
    .map((r) => ({
      id: r.id,
      name: r.name,
      avatarHue: r.avatar_hue,
      company: r.company ?? undefined,
      title: r.title ?? undefined,
      notes: r.notes,
      vip: r.vip,
      ...toParts(r.contact_identities),
      mergedFrom: merged
        .filter((m) => m.merged_into === r.id)
        .map((m) => ({ id: m.id, name: m.name, ...toParts(r.contact_identities.filter((i) => i.original_contact_id === m.id)) })),
      isDemo: false,
    }));
}
