import { connection, NextResponse } from "next/server";
import { getSessionUser, supabaseConfigured } from "@/server/supabase";

export async function GET() {
  // Per-request: reflects runtime env and the caller's session, never a build-time snapshot.
  await connection();
  if (!supabaseConfigured()) return NextResponse.json({ backend: false, user: null });
  const user = await getSessionUser();
  return NextResponse.json({ backend: true, user: user ? { id: user.id, email: user.email, name: user.user_metadata?.full_name ?? null } : null });
}
