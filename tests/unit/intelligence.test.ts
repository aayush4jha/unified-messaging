import { describe, expect, it } from "vitest";
import { createDemoData } from "@/lib/demo/seed";
import { detectIntent, ruleAnswer } from "@/lib/intelligence/assistant";
import { computeAnalytics } from "@/lib/intelligence/analytics";
import { detectFollowUps } from "@/lib/intelligence/followups";
import { DEFAULT_PRIORITY_RULES, scoreConversation } from "@/lib/intelligence/priority";
import { findDeadline, looksAutomated } from "@/lib/intelligence/signals";
import { parseQuery, runSearch } from "@/lib/search";

const NOW = new Date("2026-11-12T11:00:00").getTime();
const data = createDemoData(NOW);
const ctx = { contacts: data.contacts, accounts: data.accounts, now: new Date(NOW) };
const search = (q: string) => runSearch(parseQuery(q, ctx), data);
const priorityCtx = { contacts: new Map(data.contacts.map((c) => [c.id, c])), accounts: new Map(data.accounts.map((a) => [a.id, a])), rules: DEFAULT_PRIORITY_RULES, selfNames: ["alex"], now: NOW };

describe("universal search (spec example queries)", () => {
  it("finds the email from Rahul last week, authored by Rahul", () => {
    const parsed = parseQuery("Find the email I received from Rahul last week", ctx);
    expect(parsed.chips.map((c) => c.label)).toEqual(expect.arrayContaining(["Last week", "Emails", "From: Rahul Mehta"]));
    const hits = runSearch(parsed, data);
    expect(hits[0].conversation.id).toBe("cv_rahul_internship");
    expect(hits[0].message?.authorId).toBe("c_rahul");
  });
  it("finds the WhatsApp conversation where someone shared a PDF", () => {
    const hits = search("Find the WhatsApp conversation where someone shared a PDF");
    expect(hits.map((h) => h.conversation.id)).toEqual(["cv_jordan_wa"]);
  });
  it("matches an exact phrase", () => {
    expect(search('message containing "internship opportunity"')[0].conversation.id).toBe("cv_rahul_internship");
  });
  it("finds all conversations with a person across platforms", () => {
    const ids = search("all conversations with Rahul").map((h) => h.conversation.id).sort();
    expect(ids).toEqual(["cv_rahul_internship", "cv_rahul_li"]);
  });
  it("finds a LinkedIn conversation from October", () => {
    const parsed = parseQuery("Find a LinkedIn conversation from October", ctx);
    expect(parsed.chips.map((c) => c.label)).toEqual(expect.arrayContaining(["LinkedIn", "October 2026"]));
    expect(runSearch(parsed, data)[0].conversation.id).toBe("cv_ethan_li");
  });
  it("finds messages mentioning a company", () => {
    expect(search("messages mentioning Halcyon").map((h) => h.conversation.id)).toContain("cv_daniel_proposal");
  });
});

describe("signals", () => {
  it("resolves deadline phrases relative to the message date", () => {
    const thu = "2026-11-12T10:00:00";
    expect(new Date(findDeadline("send it by Wednesday EOD please", thu)!.dueAt).getDay()).toBe(3);
    expect(findDeadline("Please submit by November 20 so I can sign off", thu)!.dueAt.slice(0, 10)).toBe("2026-11-20");
    expect(findDeadline("no deadline here", thu)).toBeNull();
  });
  it("recognizes automated mail", () => {
    expect(looksAutomated("This is an automated message. Please don't reply.")).toBe(true);
    expect(looksAutomated("Can we meet Thursday?")).toBe(false);
  });
});

describe("prioritization", () => {
  it("ranks VIP + deadline high, newsletters low, and explains why", () => {
    const rahul = data.conversations.find((c) => c.id === "cv_rahul_internship")!;
    const r = scoreConversation(rahul, data.messages[rahul.id], priorityCtx);
    expect(r.priority).toBe("high");
    expect(r.reasons).toEqual(expect.arrayContaining(["Rahul Mehta is a VIP"]));
    const news = data.conversations.find((c) => c.id === "cv_newsletter")!;
    expect(scoreConversation(news, data.messages[news.id], priorityCtx).priority).toBe("low");
  });
  it("boosts mentions in channels", () => {
    const ch = data.conversations.find((c) => c.id === "cv_slack_design_review")!;
    expect(scoreConversation(ch, data.messages[ch.id], priorityCtx).reasons).toContain("You were mentioned");
  });
});

describe("follow-ups", () => {
  const f = detectFollowUps(data.conversations, data.messages, NOW);
  it("detects people waiting on you and you waiting on them", () => {
    expect(f.some((x) => x.type === "needs_reply" && x.conversationId === "cv_omar_ta")).toBe(true);
    expect(f.some((x) => x.type === "awaiting_them" && x.conversationId === "cv_landlord")).toBe(true);
  });
  it("detects your own commitments with a due date", () => {
    expect(f.some((x) => x.type === "your_commitment" && x.conversationId === "cv_priya_mail")).toBe(true);
  });
  it("never flags automated mail as needing a reply", () => {
    expect(f.some((x) => x.conversationId === "cv_bank")).toBe(false);
  });
});

describe("assistant intents", () => {
  it("routes the spec's questions", () => {
    expect(detectIntent("What important messages did I miss today?")).toBe("missed");
    expect(detectIntent("Which emails require my attention?")).toBe("attention");
    expect(detectIntent("Who am I waiting for a response from?")).toBe("waiting");
    expect(detectIntent("Show all conversations with Rahul.")).toBe("with_person");
    expect(detectIntent("Summarize my discussions with this company.")).toBe("summarize");
    expect(detectIntent("Draft a follow-up to someone I contacted last week.")).toBe("draft_followup");
  });
  it("answers 'waiting' with rules and only from AI-enabled accounts", () => {
    const d = { ...data, priorityCtx, now: NOW };
    expect(ruleAnswer("Who am I waiting for a response from?", d).conversationIds).toContain("cv_landlord");
    const noAI = { ...d, accounts: d.accounts.map((a) => (a.id === "acc_gmail_personal" ? { ...a, aiEnabled: false } : a)) };
    expect(ruleAnswer("Who am I waiting for a response from?", noAI).conversationIds).not.toContain("cv_landlord");
  });
});

describe("analytics", () => {
  it("derives counts and response times from messages only", () => {
    const a = computeAnalytics({ ...data, rangeDays: 30, now: NOW });
    const total = Object.values(data.messages).flat().length;
    expect(a.totals.received + a.totals.sent).toBeLessThanOrEqual(total);
    expect(a.responseTime.samples).toBeGreaterThan(0);
    expect(a.daily).toHaveLength(30);
  });
});
