import { NextResponse } from "next/server";
import { getConnector } from "@/server/connectors";
import { connectorErrorResponse, requireUser } from "@/server/http";
import { getServiceClient, getUserClient } from "@/server/supabase";
import { contextFor, loadAccount } from "@/server/sync";

/**
 * Streams a received attachment from the provider. Orbit doesn't store file
 * bytes. Always served as a download with nosniff and a sandbox CSP, so an
 * HTML or SVG attachment can't execute in Orbit's origin.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/attachments/[messageId]/[index]">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { messageId, index } = await ctx.params;

  // RLS: the user can only read their own message rows.
  const db = await getUserClient();
  const { data: msg } = await db.from("messages").select("external_id, metadata, conversations(account_id)").eq("id", messageId).maybeSingle();
  const att = (msg?.metadata as { attachments?: { externalId?: string; name: string; mimeType: string; size: number }[] } | null)?.attachments?.[Number(index)];
  const accountId = (msg?.conversations as unknown as { account_id: string } | null)?.account_id;
  if (!msg?.external_id || !att || !accountId) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  const service = getServiceClient();
  const row = await loadAccount(service, auth.user.id, accountId);
  const connector = row && getConnector(row.platform_id);
  if (!row || !connector?.downloadAttachment) return NextResponse.json({ error: "Downloads aren't supported for this account" }, { status: 404 });
  try {
    const file = await connector.downloadAttachment(contextFor(service, row), msg.external_id, att);
    const safeName = file.name.replace(/[\r\n"]/g, "_");
    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        "content-type": file.mimeType || "application/octet-stream",
        "content-length": String(file.data.length),
        "content-disposition": `attachment; filename="${safeName.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox; default-src 'none'",
        "cache-control": "private, max-age=300",
      },
    });
  } catch (e) {
    return connectorErrorResponse(e);
  }
}
