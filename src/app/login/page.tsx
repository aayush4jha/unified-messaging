import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };
export const instant = false;

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm configured={!!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)} />
    </Suspense>
  );
}
