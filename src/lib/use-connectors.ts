"use client";

import { useEffect, useState } from "react";
import type { PlatformId } from "./types";
import type { SupportLevel } from "./platforms";

export interface ConnectorStatus {
  platform: PlatformId;
  support: SupportLevel;
  configured: boolean;
  missingEnv: string[];
}

export interface ServerStatus {
  backend: { supabase: boolean; encryption: boolean; ai: boolean };
  connectors: ConnectorStatus[];
}

let cache: ServerStatus | null = null;
let inflight: Promise<ServerStatus | null> | null = null;

function load(): Promise<ServerStatus | null> {
  if (cache) return Promise.resolve(cache);
  inflight ??= fetch("/api/connectors")
    .then((r) => (r.ok ? (r.json() as Promise<ServerStatus>) : null))
    .then((d) => (cache = d))
    .catch(() => null)
    .finally(() => (inflight = null));
  return inflight;
}

/** Server capability status (which connectors are configured), fetched once per session. */
export function useServerStatus(): { status: ServerStatus | null; loading: boolean } {
  const [status, setStatus] = useState<ServerStatus | null>(cache);
  const [loading, setLoading] = useState(!cache);
  useEffect(() => {
    let alive = true;
    void load().then((s) => {
      if (!alive) return;
      setStatus(s);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { status, loading };
}
