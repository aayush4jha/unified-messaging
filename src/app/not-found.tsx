import Link from "next/link";
import { OrbitMark } from "@/components/brand/platform-icon";

export default function NotFound() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-bg px-6 text-center">
      <OrbitMark size={40} />
      <p className="mt-6 text-xs font-medium uppercase tracking-[0.08em] text-fg-3">404</p>
      <h1 className="mt-1 text-[1.375rem] font-semibold tracking-[-0.02em]">This page drifted out of orbit</h1>
      <p className="mt-2 max-w-[360px] text-[0.875rem] text-fg-2">The link may be old, or the conversation was removed when its account was disconnected.</p>
      <Link href="/inbox" className="mt-6 inline-flex h-9 items-center rounded-sm bg-accent px-4 text-[0.8125rem] font-medium text-accent-contrast hover:bg-accent-hover">
        Back to your inbox
      </Link>
    </div>
  );
}
