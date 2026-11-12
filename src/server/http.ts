import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { AuthError, ConnectorError, RateLimitError } from "./connectors/types";
import { getSessionUser, supabaseConfigured } from "./supabase";

/** Resolves the signed-in user or returns a JSON error response. */
export async function requireUser(): Promise<{ user: User } | { response: NextResponse }> {
  if (!supabaseConfigured()) return { response: NextResponse.json({ error: "Live accounts need the Supabase backend. See .env.example.", code: "backend_unconfigured" }, { status: 503 }) };
  const user = await getSessionUser();
  if (!user) return { response: NextResponse.json({ error: "Sign in to continue.", code: "unauthenticated" }, { status: 401 }) };
  return { user };
}

export function connectorErrorResponse(e: unknown): NextResponse {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message, code: "needs_reauth" }, { status: 401 });
  if (e instanceof RateLimitError) return NextResponse.json({ error: e.message, code: "rate_limited" }, { status: 429, headers: { "retry-after": String(e.retryAfter) } });
  if (e instanceof ConnectorError) return NextResponse.json({ error: e.message, code: e.retryable ? "transient" : "rejected" }, { status: e.retryable ? 503 : 422 });
  console.error("[api]", e);
  return NextResponse.json({ error: "Something went wrong on Orbit's side." }, { status: 500 });
}
