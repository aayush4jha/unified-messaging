import { NextResponse } from "next/server";
import { getUserClient, supabaseConfigured } from "@/server/supabase";

/** Supabase Auth (magic link / OAuth sign-in) code exchange. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/inbox";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/inbox";
  if (!supabaseConfigured() || !code) return NextResponse.redirect(new URL("/login?error=missing_code", url));
  const supabase = await getUserClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url));
  return NextResponse.redirect(new URL(safeNext, url));
}
