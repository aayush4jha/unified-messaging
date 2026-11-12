"use client";

import { createBrowserClient } from "@supabase/ssr";
import { ArrowRight, Mail } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { OrbitLogo } from "../brand/platform-icon";
import { Button } from "../ui/button";
import { Input } from "../ui/controls";

export function LoginForm({ configured }: { configured: boolean }) {
  const params = useSearchParams();
  const next = params.get("next") ?? "/inbox";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("error"));

  return (
    <div className="app-frame flex flex-col items-center justify-center overflow-y-auto bg-bg px-5">
      <div className="w-full max-w-[380px]">
        <OrbitLogo className="mb-8" />
        <h1 className="text-[1.5rem] font-semibold tracking-[-0.03em]">Sign in to Orbit</h1>
        {!configured ? (
          <div className="mt-4 space-y-4 text-[0.875rem] leading-6 text-fg-2">
            <p>This deployment doesn&apos;t have the account backend configured yet. Live accounts need Supabase (see <code className="font-mono text-xs">.env.example</code>).</p>
            <Button asChild variant="primary">
              <Link href="/onboarding">
                Explore the sample workspace <ArrowRight />
              </Link>
            </Button>
          </div>
        ) : sent ? (
          <div className="mt-6 rounded-lg border border-line bg-surface p-4 text-[0.875rem] text-fg-2">
            <Mail className="mb-2 size-5 text-accent-text" />
            Check <b className="text-fg">{email}</b> for a sign-in link. You can close this tab.
          </div>
        ) : (
          <form
            className="mt-6 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
              const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
              setBusy(false);
              if (error) setError(error.message);
              else setSent(true);
            }}
          >
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email" className="h-10" autoFocus />
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
              Email me a sign-in link
            </Button>
            {error ? <p className="text-xs text-danger">{error}</p> : null}
            <p className="text-xs text-fg-3">Orbit uses passwordless sign-in. Connected accounts use each provider&apos;s own OAuth.</p>
          </form>
        )}
      </div>
    </div>
  );
}
