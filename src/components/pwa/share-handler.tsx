"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { ListSkeleton } from "@/components/ui/empty";
import { useUI } from "@/store/ui";
import { useWorkspace } from "@/store/workspace";

/** Turns shared text/links into a new message, then lands on the inbox behind it. */
export function shareToDraft(params: { title?: string | null; text?: string | null; url?: string | null }) {
  const title = params.title?.trim() || undefined;
  const text = params.text?.trim() || undefined;
  const url = params.url?.trim() || undefined;
  const body = [text, url && !text?.includes(url) ? url : undefined].filter(Boolean).join("\n\n") || undefined;
  return { subject: title && title !== text ? title : undefined, body };
}

export function ShareHandler() {
  const params = useSearchParams();
  const router = useRouter();
  const hydrated = useWorkspace((s) => s.hydrated);
  const openCompose = useUI((s) => s.openCompose);
  const done = useRef(false);

  useEffect(() => {
    if (!hydrated || done.current) return;
    done.current = true;
    openCompose(shareToDraft({ title: params.get("title"), text: params.get("text"), url: params.get("url") }));
    router.replace("/inbox");
  }, [hydrated, params, openCompose, router]);

  return <ListSkeleton />;
}
