import { toast } from "sonner";

type QueuedRequest = { url: string; method: string; body: unknown; ordered: boolean };

/**
 * Coalesces local edits into a few API calls. Edits that fail because the
 * network is down (or the server is briefly unavailable) stay queued and are
 * retried with backoff and as soon as the device is back online, so nothing
 * made on a flaky mobile connection is lost. Rejected edits (4xx) are dropped.
 */
export class Outbox {
  private requests = new Map<string, QueuedRequest>();
  private collections = new Map<string, { upserts: Map<string, unknown>; deletes: Set<string> }>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing: Promise<void> | null = null;
  private attempt = 0;
  private warned = false;

  constructor(private fetcher: typeof fetch = (...a) => fetch(...a)) {}

  pending() {
    return this.requests.size > 0 || this.collections.size > 0 || !!this.flushing;
  }

  request(url: string, method: string, body: unknown, key = `${method} ${url}`, ordered = false) {
    const existing = this.requests.get(key);
    // PATCH bodies merge so two quick toggles on one conversation become one request.
    const merged = existing && method === "PATCH" ? { ...(existing.body as object), ...(body as object) } : body;
    this.requests.set(key, { url, method, body: merged, ordered });
    this.schedule();
  }

  collection(name: string, diff: { upserts: { id: string }[]; deletes: string[] }) {
    if (!diff.upserts.length && !diff.deletes.length) return;
    const c = this.collections.get(name) ?? { upserts: new Map(), deletes: new Set() };
    for (const u of diff.upserts) {
      c.upserts.set(u.id, u);
      c.deletes.delete(u.id);
    }
    for (const d of diff.deletes) {
      c.upserts.delete(d);
      c.deletes.add(d);
    }
    this.collections.set(name, c);
    this.schedule();
  }

  /** Called when the browser reports connectivity again. */
  online() {
    if (!this.requests.size && !this.collections.size) return;
    this.attempt = 0;
    void this.flush();
  }

  private schedule(delay = 800) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), delay);
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.flushing) await this.flushing;
    const requests = [...this.requests.entries()];
    const collections = [...this.collections.entries()];
    this.requests.clear();
    this.collections.clear();
    if (!requests.length && !collections.length) return;

    this.flushing = (async () => {
      let retry = false;
      let rejected = false;
      /** true = done (sent or permanently rejected), false = retry later */
      const call = async (url: string, method: string, body: unknown): Promise<boolean> => {
        const r = await this.fetcher(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => null);
        if (r?.ok) return true;
        if (!r || r.status >= 500 || r.status === 429 || r.status === 408) return false;
        rejected = true;
        return true;
      };
      const requeue = (key: string, r: QueuedRequest) => {
        retry = true;
        // A newer edit made while this was in flight wins.
        if (!this.requests.has(key)) this.requests.set(key, r);
      };
      for (const [key, r] of requests.filter(([, x]) => x.ordered)) if (!(await call(r.url, r.method, r.body))) requeue(key, r);
      await Promise.all([
        ...requests.filter(([, x]) => !x.ordered).map(async ([key, r]) => {
          if (!(await call(r.url, r.method, r.body))) requeue(key, r);
        }),
        ...collections.map(async ([name, c]) => {
          const ok = await call(`/api/data/${name}`, "POST", { upserts: [...c.upserts.values()].map(stripNotesId(name)), deletes: [...c.deletes] });
          if (ok) return;
          retry = true;
          const now = this.collections.get(name) ?? { upserts: new Map(), deletes: new Set<string>() };
          for (const [id, u] of c.upserts) if (!now.upserts.has(id) && !now.deletes.has(id)) now.upserts.set(id, u);
          for (const id of c.deletes) if (!now.upserts.has(id)) now.deletes.add(id);
          this.collections.set(name, now);
        }),
      ]);
      if (rejected) toast.error("Some changes didn't save to the server", { description: "The server rejected them. Reload to see the saved state." });
      if (retry) {
        this.attempt++;
        if (!this.warned) {
          this.warned = true;
          toast("Saved on this device", { description: "Orbit will sync your changes when the connection is back." });
        }
        this.schedule(Math.min(30_000, 2_000 * 2 ** (this.attempt - 1)));
      } else {
        this.attempt = 0;
        this.warned = false;
      }
    })();
    await this.flushing;
    this.flushing = null;
  }
}

/** Notes are keyed by conversation; the synthetic `id` used for coalescing isn't sent. */
const stripNotesId = (name: string) => (u: unknown) => {
  if (name !== "notes") return u;
  const rest: Record<string, unknown> = { ...(u as Record<string, unknown>) };
  delete rest.id;
  return rest;
};
