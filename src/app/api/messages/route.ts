import { NextResponse } from "next/server";
import * as z from "zod/v4";
import type { OutboundFile } from "@/server/connectors/types";
import { connectorErrorResponse, requireUser } from "@/server/http";
import { clientKey, rateLimit } from "@/server/rate-limit";
import { sendMessage } from "@/server/sync";

export const maxDuration = 60;

const Body = z.object({
  clientId: z.string().min(8).max(100),
  accountId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  to: z.array(z.string().max(320)).max(100),
  cc: z.array(z.string().max(320)).max(100).optional(),
  subject: z.string().max(998).optional(),
  body: z.string().max(200_000),
});

const MAX_FILES = 10;
const MAX_TOTAL = 25 * 1024 * 1024;

/**
 * Sends through the account's connector. Idempotent on clientId (see sendMessage).
 * JSON for text-only messages; multipart/form-data (`payload` + `file` parts) with attachments.
 * Note: some hosts cap request bodies (Vercel functions: 4.5 MB).
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let raw: unknown;
  const files: OutboundFile[] = [];
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
    raw = JSON.parse(String(form.get("payload") ?? "{}"));
    const parts = form.getAll("file").filter((f): f is File => typeof f !== "string");
    if (parts.length > MAX_FILES) return NextResponse.json({ error: `Attach at most ${MAX_FILES} files.` }, { status: 400 });
    if (parts.reduce((n, f) => n + f.size, 0) > MAX_TOTAL) return NextResponse.json({ error: "Attachments can total at most 25 MB." }, { status: 413 });
    for (const f of parts) files.push({ name: f.name.slice(0, 200) || "file", mimeType: f.type || "application/octet-stream", data: Buffer.from(await f.arrayBuffer()) });
  } else {
    raw = await req.json().catch(() => ({}));
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid message" }, { status: 400 });
  if (!parsed.data.body.trim() && files.length === 0) return NextResponse.json({ error: "Write a message or attach a file." }, { status: 400 });
  if (req.headers.get("idempotency-key") && req.headers.get("idempotency-key") !== parsed.data.clientId) return NextResponse.json({ error: "Idempotency key mismatch" }, { status: 400 });
  if (!rateLimit(clientKey(req, `send:${auth.user.id}`), 30, 60_000).ok) return NextResponse.json({ error: "You're sending very quickly. Wait a moment." }, { status: 429 });
  try {
    return NextResponse.json(await sendMessage(auth.user.id, { ...parsed.data, attachments: files }));
  } catch (e) {
    return connectorErrorResponse(e);
  }
}
