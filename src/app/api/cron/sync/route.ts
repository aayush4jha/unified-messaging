import { NextResponse } from "next/server";
import { safeEqual } from "@/server/crypto";
import { getServiceClient, supabaseConfigured } from "@/server/supabase";
import { notifyUser } from "@/server/push";
import { sendMessage, syncAccount } from "@/server/sync";

export const maxDuration = 300;

/**
 * Scheduled job (e.g. Vercel Cron every 5 minutes, or any scheduler calling with the bearer secret):
 * incremental sync, retry of rate-limited jobs, scheduled sends, retention cleanup, unread snapshots.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || !safeEqual(auth, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!supabaseConfigured()) return NextResponse.json({ error: "backend not configured" }, { status: 503 });
  const db = getServiceClient();
  const report = { synced: 0, failed: 0, scheduledSent: 0, scheduledFailed: 0, retentionDeleted: 0, snapshots: 0 };

  // 1. Incremental sync for accounts not synced in the last 5 minutes (oldest first).
  const stale = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: accounts } = await db.from("connected_accounts").select("id,user_id").in("status", ["connected", "error"]).or(`last_synced_at.is.null,last_synced_at.lt.${stale}`).order("last_synced_at", { ascending: true, nullsFirst: true }).limit(20);
  for (const a of accounts ?? []) {
    try {
      await syncAccount(a.user_id, a.id);
      report.synced++;
    } catch {
      report.failed++;
    }
  }

  // 2. Scheduled messages that are due.
  const { data: due } = await db.from("scheduled_messages").select("*").eq("status", "scheduled").lte("send_at", new Date().toISOString()).limit(50);
  for (const m of due ?? []) {
    const claimed = await db.from("scheduled_messages").update({ status: "sending" }).eq("id", m.id).eq("status", "scheduled").select("id");
    if (!claimed.data?.length) continue; // another run took it
    try {
      await sendMessage(m.user_id, { clientId: m.client_id, accountId: m.account_id, conversationId: m.conversation_id ?? undefined, to: m.to_addrs, subject: m.subject ?? undefined, body: m.body });
      await db.from("scheduled_messages").update({ status: "sent" }).eq("id", m.id);
      report.scheduledSent++;
    } catch (e) {
      await db.from("scheduled_messages").update({ status: "failed", error: (e as Error).message.slice(0, 300) }).eq("id", m.id);
      await notifyUser(db, { user_id: m.user_id, kind: "system", title: "A scheduled message failed", body: (e as Error).message.slice(0, 200), account_id: m.account_id });
      report.scheduledFailed++;
    }
  }

  // 3. Retention: delete message bodies older than each user's retention window.
  const { data: prefs } = await db.from("user_preferences").select("user_id,retention_days");
  for (const p of prefs ?? []) {
    const cutoff = new Date(Date.now() - p.retention_days * 86_400_000).toISOString();
    const { count } = await db.from("messages").delete({ count: "exact" }).eq("user_id", p.user_id).lt("sent_at", cutoff);
    report.retentionDeleted += count ?? 0;
  }

  // 4. Daily unread snapshot per user (powers the honest unread trend in Analytics).
  const today = new Date().toISOString().slice(0, 10);
  const { data: users } = await db.from("connected_accounts").select("user_id");
  for (const uid of new Set((users ?? []).map((u) => u.user_id))) {
    const { count } = await db.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("archived", false).gt("unread_count", 0);
    await db.from("unread_snapshots").upsert({ user_id: uid, day: today, unread_conversations: count ?? 0 });
    report.snapshots++;
  }

  return NextResponse.json(report);
}
