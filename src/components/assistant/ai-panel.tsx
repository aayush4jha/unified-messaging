"use client";

import type { Conversation, Message } from "@/lib/types";

/** AI summary + smart replies for a conversation. Implemented in the AI stage. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function AIPanel(_props: { conversation: Conversation; messages: Message[]; needsReply: boolean; onUseReply: (text: string) => void }) {
  return null;
}
