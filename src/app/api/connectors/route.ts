import { connection, NextResponse } from "next/server";
import { PLATFORMS, PLATFORM_ORDER } from "@/lib/platforms";
import { aiConfigured } from "@/server/ai";

/**
 * Which connectors this deployment can actually offer. Only reports whether
 * required env vars are present (never their values).
 */
export async function GET() {
  // Per-request: env can change between deploys/restarts.
  await connection();
  const backend = {
    supabase: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY),
    encryption: !!process.env.ORBIT_TOKEN_ENCRYPTION_KEY,
    ai: aiConfigured(),
  };
  const connectors = PLATFORM_ORDER.map((id) => {
    const p = PLATFORMS[id];
    const missing = p.requiredEnv.filter((k) => !process.env[k]);
    if (p.support === "live" && (!backend.supabase || !backend.encryption)) {
      if (!backend.supabase) missing.push("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY");
      if (!backend.encryption) missing.push("ORBIT_TOKEN_ENCRYPTION_KEY");
    }
    return { platform: id, support: p.support, configured: p.support === "live" && missing.length === 0, missingEnv: missing };
  });
  return NextResponse.json({ backend, connectors });
}
