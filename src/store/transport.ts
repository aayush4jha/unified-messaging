/**
 * Message transport.
 *
 * The workspace store never marks a message as sent on its own. It hands the
 * request to a transport, shows the message as "pending", and only flips it
 * to "sent" when the transport confirms. Every request carries a `clientId`
 * idempotency key, so retries can't create duplicates.
 *
 *  - DemoTransport: sample accounts. Simulates network latency and the
 *    failure modes of real connectors (expired auth, offline) so the
 *    UI states can be exercised. Clearly labeled as a simulation.
 *  - LiveTransport: POSTs to /api/messages, which dispatches to the real
 *    connector on the server.
 */
import type { Account, Message, SendRequest, SendResult } from "@/lib/types";
import { capabilitiesFor } from "@/lib/platforms";

export interface Transport {
  send(req: SendRequest, account: Account): Promise<SendResult>;
}

const confirmed = new Map<string, SendResult>();

export const DemoTransport: Transport = {
  async send(req, account) {
    const prior = confirmed.get(req.clientId);
    if (prior) return prior;

    await new Promise((r) => setTimeout(r, 550 + Math.random() * 500));

    const caps = capabilitiesFor(account.platform, account.capabilityOverrides);
    if (!caps.send && !caps.reply) {
      return { ok: false, error: `${account.label} doesn't support sending.`, retryable: false };
    }
    if (account.status === "needs_reauth") {
      return { ok: false, error: `${account.label} needs to reconnect before it can send. Reconnect it in Settings → Accounts.`, retryable: true };
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { ok: false, error: "You're offline. The message wasn't sent.", retryable: true };
    }

    const message: Message = {
      id: `msg_${req.clientId}`,
      conversationId: req.conversationId ?? `cv_${req.clientId}`,
      authorId: "me",
      body: req.body,
      sentAt: new Date().toISOString(),
      status: "sent",
      attachments: req.attachments,
      subject: req.subject,
      to: req.to,
      cc: req.cc,
      clientId: req.clientId,
      isDemo: true,
    };
    const result: SendResult = { ok: true, message, conversationId: message.conversationId };
    confirmed.set(req.clientId, result);
    return result;
  },
};

export const LiveTransport: Transport = {
  async send(req) {
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": req.clientId },
        body: JSON.stringify(req),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          error: data.error ?? `Send failed (${res.status})`,
          retryable: res.status >= 500 || res.status === 429 || res.status === 401,
        };
      }
      return { ok: true, message: data.message as Message, conversationId: data.conversationId as string };
    } catch {
      return { ok: false, error: "Couldn't reach Orbit's servers. Check your connection and retry.", retryable: true };
    }
  },
};

export function transportFor(account: Account): Transport {
  return account.isDemo ? DemoTransport : LiveTransport;
}
