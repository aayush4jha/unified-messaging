"use client";

/**
 * Browser helper for Orbit's AI endpoints. Builds transcripts from the
 * workspace store, only for accounts where AI access is enabled.
 */
import { PLATFORMS } from "./platforms";
import type { Account, Conversation, Message } from "./types";
import { DEMO_USER } from "./demo/seed";

export interface Transcript {
  id: string;
  platform: string;
  account: string;
  kind: string;
  title: string;
  participants: string[];
  messages: { author: string; sentAt: string; body: string; subject?: string; attachments?: string[] }[];
}

export function toTranscript(conv: Conversation, messages: Message[], account?: Account, maxMessages = 200): Transcript {
  const name = (id: string) => (id === "me" ? "You" : (conv.participants.find((p) => p.id === id)?.name ?? "Unknown"));
  return {
    id: conv.id,
    platform: PLATFORMS[conv.platform].name,
    account: account ? `${account.label} (${account.handle})` : conv.accountId,
    kind: conv.kind,
    title: conv.kind === "channel" ? `#${conv.title}` : conv.title,
    participants: conv.participants.map((p) => `${p.name}${p.handle ? ` <${p.handle}>` : ""}`),
    messages: messages
      .filter((m) => m.status !== "failed" && m.status !== "pending")
      .slice(-maxMessages)
      .map((m) => ({
        author: name(m.authorId),
        sentAt: new Date(m.sentAt).toISOString(),
        body: m.body,
        subject: m.subject,
        attachments: m.attachments.length ? m.attachments.map((a) => a.name) : undefined,
      })),
  };
}

export class AIError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
  ) {
    super(message);
  }
}

export async function callAI<T>(body: Record<string, unknown>): Promise<T & { model: string }> {
  let res: Response;
  try {
    res = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json", "x-orbit-owner": DEMO_USER.name },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AIError("Couldn't reach Orbit's server.", "network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AIError(data.error ?? `AI request failed (${res.status})`, data.code, res.status);
  return data;
}
