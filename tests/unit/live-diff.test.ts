import { describe, expect, it } from "vitest";
import { createDemoData } from "@/lib/demo/seed";
import { conversationPatch, diffById, diffContacts, diffConversationLabels, diffNotes } from "@/lib/live-diff";

const data = createDemoData(new Date("2026-11-12T11:00:00").getTime());

describe("live diffing", () => {
  it("finds new, changed and removed records by reference", () => {
    const [a, b, c] = data.reminders;
    const changed = { ...b, title: "edited" };
    const d = diffById([a, b, c], [a, changed, { ...a, id: "new" }]);
    expect(d.upserts.map((x) => x.id)).toEqual([b.id, "new"]);
    expect(d.deletes).toEqual([c.id]);
  });

  it("diffs notes keyed by conversation", () => {
    const n1 = { conversationId: "c1", body: "a", updatedAt: "x" };
    const n2 = { conversationId: "c2", body: "b", updatedAt: "x" };
    const d = diffNotes({ c1: n1, c2: n2 }, { c1: { ...n1, body: "a2" } });
    expect(d.upserts.map((n) => n.body)).toEqual(["a2"]);
    expect(d.deletes).toEqual(["c2"]);
  });

  it("emits only changed conversation fields, including read state", () => {
    const c = data.conversations[0];
    expect(conversationPatch(c, { ...c, starred: !c.starred, unreadCount: 0 })).toEqual({ starred: !c.starred, ...(c.unreadCount > 0 ? { unread: false } : {}) });
    expect(conversationPatch(c, { ...c })).toEqual({});
  });

  it("emits full label sets only when they actually change", () => {
    const c = data.conversations.find((x) => x.labels.length)!;
    expect(diffConversationLabels([c], [{ ...c, labels: [...c.labels] }])).toEqual([]);
    expect(diffConversationLabels([c], [{ ...c, labels: [...c.labels, "lbl_new"] }])).toEqual([{ conversationId: c.id, labelIds: [...c.labels, "lbl_new"] }]);
  });

  it("recognizes merges, unmerges and field edits on contacts", () => {
    const jordan = data.contacts.find((c) => c.id === "c_jordan")!;
    const jlee = data.contacts.find((c) => c.id === "c_jordan_mail")!;
    const merged = { ...jordan, mergedFrom: [{ id: jlee.id, name: jlee.name, handles: jlee.handles, emails: jlee.emails, phones: jlee.phones }] };
    const afterMerge = data.contacts.filter((c) => c.id !== jlee.id).map((c) => (c.id === jordan.id ? merged : c));
    expect(diffContacts(data.contacts, afterMerge)).toMatchObject({ merges: [{ primaryId: jordan.id, secondaryId: jlee.id }], unmerges: [], edits: [] });

    const afterUnmerge = [...afterMerge.map((c) => (c.id === jordan.id ? { ...merged, mergedFrom: [] } : c)), jlee];
    expect(diffContacts(afterMerge, afterUnmerge).unmerges).toEqual([{ primaryId: jordan.id, mergedId: jlee.id }]);

    const edited = data.contacts.map((c) => (c.id === jordan.id ? { ...c, vip: true } : c));
    expect(diffContacts(data.contacts, edited).edits).toEqual([expect.objectContaining({ id: jordan.id, vip: true })]);
  });
});
