import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export function supabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Request-scoped client that acts as the signed-in user. Every query through
 * it is subject to Row Level Security (user_id = auth.uid()).
 */
export async function getUserClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component where cookies are read-only; the proxy refreshes sessions.
        }
      },
    },
  });
}

/** Returns the authenticated user (verified with Supabase Auth), or null. */
export async function getSessionUser(): Promise<User | null> {
  if (!supabaseConfigured()) return null;
  const supabase = await getUserClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

let service: SupabaseClient | null = null;
/**
 * Service-role client for background jobs and webhooks only (bypasses RLS).
 * Every query made with it MUST filter by an explicit user_id.
 */
export function getServiceClient(): SupabaseClient {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  service ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return service;
}
