import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { AIRefusalError, AIUnavailableError, AI_MODEL, aiConfigured, answerQuestion, suggestReplies, summarizeConversation, writeBriefing } from "@/server/ai";
import { getSessionUser, supabaseConfigured } from "@/server/supabase";
import { clientKey, rateLimit } from "@/server/rate-limit";

const Transcript = z.object({
  id: z.string().max(200),
  platform: z.string().max(40),
  account: z.string().max(200),
  kind: z.string().max(20),
  title: z.string().max(500),
  participants: z.array(z.string().max(200)).max(200),
  messages: z
    .array(
      z.object({
        author: z.string().max(200),
        sentAt: z.string().max(40),
        body: z.string().max(100_000),
        subject: z.string().max(500).optional(),
        attachments: z.array(z.string().max(300)).max(50).optional(),
      }),
    )
    .max(2000),
});

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("summarize"), conversation: Transcript }),
  z.object({
    action: z.literal("replies"),
    conversation: Transcript,
    tones: z.array(z.enum(["professional", "casual", "short", "detailed", "follow_up"])).min(1).max(5),
    instruction: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("briefing"),
    sections: z.record(z.string(), z.array(z.object({ conversationId: z.string(), title: z.string(), detail: z.string() })).max(20)),
    transcripts: z.array(Transcript).max(15),
  }),
  z.object({
    action: z.literal("ask"),
    question: z.string().min(1).max(2000),
    transcripts: z.array(Transcript).max(20),
    signals: z.unknown(),
    history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).max(20),
  }),
]);

export async function GET() {
  return NextResponse.json({ configured: aiConfigured(), model: aiConfigured() ? AI_MODEL : null });
}

export async function POST(req: Request) {
  if (!aiConfigured()) return NextResponse.json({ error: "AI isn't configured on this server. Add ANTHROPIC_API_KEY to enable it.", code: "ai_unconfigured" }, { status: 503 });

  // When accounts live in Supabase, AI is only available to signed-in users.
  let ownerName = "the user";
  if (supabaseConfigured()) {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Sign in to use AI features." }, { status: 401 });
    ownerName = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? ownerName;
  }

  const limit = rateLimit(clientKey(req, "ai"), 30, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many AI requests. Try again shortly." }, { status: 429, headers: { "retry-after": String(limit.retryAfter) } });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Invalid request", details: e instanceof z.ZodError ? e.issues.slice(0, 3) : undefined }, { status: 400 });
  }
  const headerName = req.headers.get("x-orbit-owner");
  if (!supabaseConfigured() && headerName) ownerName = headerName.slice(0, 80);
  const now = new Date().toString();

  try {
    switch (body.action) {
      case "summarize":
        return NextResponse.json({ ...(await summarizeConversation(body.conversation, now)), model: AI_MODEL });
      case "replies":
        return NextResponse.json({ ...(await suggestReplies(body.conversation, { tones: body.tones, ownerName, now, instruction: body.instruction })), model: AI_MODEL });
      case "briefing":
        return NextResponse.json({ ...(await writeBriefing({ now, ownerName, sections: body.sections, transcripts: body.transcripts })), model: AI_MODEL });
      case "ask":
        return NextResponse.json({ ...(await answerQuestion({ question: body.question, now, ownerName, transcripts: body.transcripts, signals: body.signals, history: body.history })), model: AI_MODEL });
    }
  } catch (e) {
    if (e instanceof AIUnavailableError) return NextResponse.json({ error: e.message, code: "ai_unconfigured" }, { status: 503 });
    if (e instanceof AIRefusalError) return NextResponse.json({ error: "The AI couldn't help with this conversation.", code: "refusal" }, { status: 422 });
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "The AI provider is rate limiting requests. Try again in a minute." }, { status: 429 });
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "The server's Anthropic credentials were rejected." }, { status: 502 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `AI provider error (${e.status ?? "network"}).` }, { status: 502 });
    console.error("[ai]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI request failed" }, { status: 500 });
  }
}
