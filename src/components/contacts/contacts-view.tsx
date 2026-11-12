"use client";

import { ArrowLeft, Check, Copy, Crown, GitMerge, Mail, Phone, Plus, Search, Split, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PLATFORMS } from "@/lib/platforms";
import { inboxHref } from "@/lib/routes";
import type { Contact } from "@/lib/types";
import { cn, formatDue, formatListTime, formatRelative } from "@/lib/utils";
import { useNow } from "@/store/selectors";
import { useWorkspace } from "@/store/workspace";
import { PlatformIcon } from "../brand/platform-icon";
import { PageHeader } from "../shell/page-header";
import { Avatar } from "../ui/avatar";
import { Button, IconButton } from "../ui/button";
import { Badge, Input, Segmented, Switch, Textarea } from "../ui/controls";
import { confirm, Dialog, DialogBody, DialogContent, DialogFooter } from "../ui/dialog";
import { EmptyState } from "../ui/empty";

type Filter = "all" | "vip" | "multi";

/** Merge suggestions require a shared email or phone number, never just a similar name. */
export function mergeSuggestions(contacts: Contact[]): { a: Contact; b: Contact; reason: string }[] {
  const out: { a: Contact; b: Contact; reason: string }[] = [];
  for (let i = 0; i < contacts.length; i++)
    for (let j = i + 1; j < contacts.length; j++) {
      const a = contacts[i];
      const b = contacts[j];
      const email = a.emails.find((e) => b.emails.includes(e));
      const phone = a.phones.find((p) => b.phones.includes(p));
      if (email) out.push({ a, b, reason: `Both use ${email}` });
      else if (phone) out.push({ a, b, reason: `Both use ${phone}` });
    }
  return out;
}

export function ContactsView() {
  const params = useSearchParams();
  const router = useRouter();
  const contacts = useWorkspace((s) => s.contacts);
  const conversations = useWorkspace((s) => s.conversations);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const selectedId = params.get("id");

  const lastInteraction = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of conversations) {
      const ids = new Set([c.contactId, ...c.participants.map((p) => p.contactId)].filter(Boolean) as string[]);
      ids.forEach((id) => {
        if (!m.has(id) || m.get(id)! < c.lastMessageAt) m.set(id, c.lastMessageAt);
      });
    }
    return m;
  }, [conversations]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts
      .filter((c) => (filter === "vip" ? c.vip : filter === "multi" ? new Set(c.handles.map((h) => h.platform)).size > 1 : true))
      .filter((c) => !q || [c.name, c.company, c.title, ...c.emails, ...c.phones, ...c.handles.map((h) => h.value)].some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) => (lastInteraction.get(b.id) ?? "").localeCompare(lastInteraction.get(a.id) ?? ""));
  }, [contacts, query, filter, lastInteraction]);

  const suggestions = useMemo(() => mergeSuggestions(contacts), [contacts]);
  const selected = contacts.find((c) => c.id === selectedId);

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <PageHeader title="Contacts" description={`${contacts.length} people across all your accounts`} />
      <div className="flex min-h-0 flex-1">
        <section className={cn("flex min-h-0 w-full flex-col border-r border-line bg-surface lg:w-[360px] lg:shrink-0", selected ? "hidden lg:flex" : "flex")} aria-label="Contact list">
          <div className="space-y-2.5 border-b border-line-subtle p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-4" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people, companies, handles" className="pl-8" aria-label="Search contacts" />
            </div>
            <Segmented
              size="xs"
              value={filter}
              onChange={setFilter}
              ariaLabel="Filter"
              options={[
                { value: "all", label: "All" },
                { value: "vip", label: "VIP" },
                { value: "multi", label: "Multi-platform" },
              ]}
            />
          </div>

          {suggestions.length > 0 ? (
            <div className="border-b border-line-subtle bg-info-soft/60 px-3 py-2.5">
              <p className="text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-info">Possible duplicates</p>
              {suggestions.slice(0, 2).map((s) => (
                <div key={`${s.a.id}-${s.b.id}`} className="mt-1.5 flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-fg-2">
                    <b className="font-medium text-fg">{s.a.name}</b> & <b className="font-medium text-fg">{s.b.name}</b> · {s.reason}
                  </span>
                  <Button size="xs" variant="secondary" onClick={() => router.push(`/contacts?id=${s.a.id}&merge=${s.b.id}`)}>
                    Review
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {list.length === 0 ? (
              <EmptyState compact icon={<Users />} title={contacts.length ? "No matches" : "No contacts yet"} description={contacts.length ? "Try another name or handle." : "People you talk to appear here automatically once accounts sync."} />
            ) : (
              list.map((c) => {
                const platforms = Array.from(new Set(c.handles.map((h) => h.platform)));
                const last = lastInteraction.get(c.id);
                return (
                  <Link
                    key={c.id}
                    href={`/contacts?id=${c.id}`}
                    scroll={false}
                    className={cn("flex items-center gap-3 border-b border-line-subtle px-4 py-2.5 hover:bg-hover", selectedId === c.id && "bg-selected")}
                  >
                    <Avatar name={c.name} hue={c.avatarHue} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[0.8125rem] font-medium">{c.name}</span>
                        {c.vip ? <Crown className="size-3 shrink-0 text-warning" aria-label="VIP" /> : null}
                        {last ? <span className="ml-auto shrink-0 text-[0.6875rem] text-fg-4">{formatListTime(last)}</span> : null}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="truncate text-xs text-fg-3">{[c.title, c.company].filter(Boolean).join(" · ") || c.emails[0] || c.handles[0]?.value}</span>
                        <span className="ml-auto flex shrink-0 gap-0.5">
                          {platforms.map((p) => (
                            <PlatformIcon key={p} platform={p} size={13} />
                          ))}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </section>

        {selected ? (
          <ContactDetail key={selected.id} contact={selected} />
        ) : (
          <div className="hidden flex-1 items-center justify-center lg:flex">
            <EmptyState icon={<Users />} title="Select a contact" description="One profile per person: every email address, phone number and handle, with conversations from every platform." />
          </div>
        )}
      </div>
    </div>
  );
}

function ContactDetail({ contact: c }: { contact: Contact }) {
  const router = useRouter();
  const params = useSearchParams();
  const now = useNow();
  const contacts = useWorkspace((s) => s.contacts);
  const conversations = useWorkspace((s) => s.conversations);
  const accounts = useWorkspace((s) => s.accounts);
  const allReminders = useWorkspace((s) => s.reminders);
  const { updateContact, mergeContacts, unmergeContact, addReminder } = useWorkspace.getState();
  const [notes, setNotes] = useState(c.notes);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: c.name, title: c.title ?? "", company: c.company ?? "" });
  const [mergeOpen, setMergeOpen] = useState(!!params.get("merge"));
  const [mergeTarget, setMergeTarget] = useState<string | null>(params.get("merge"));

  const ids = useMemo(() => new Set([c.id, ...c.mergedFrom.map((m) => m.id)]), [c]);
  const convs = useMemo(
    () => conversations.filter((x) => ids.has(x.contactId ?? "") || x.participants.some((p) => p.contactId && ids.has(p.contactId))).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
    [conversations, ids],
  );
  const reminders = allReminders.filter((r) => r.contactId === c.id && !r.completedAt);
  const suggestions = mergeSuggestions(contacts).filter((s) => s.a.id === c.id || s.b.id === c.id);

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-bg scrollbar-thin" aria-label={`${c.name} profile`}>
      <div className="mx-auto w-full max-w-[760px] px-4 py-6 sm:px-8">
        <button onClick={() => router.push("/contacts")} className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-fg-3 hover:text-fg lg:hidden">
          <ArrowLeft className="size-3.5" /> Contacts
        </button>

        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={c.name} hue={c.avatarHue} size="xl" />
          <div className="min-w-0 flex-1">
            {editing ? (
              <form
                className="grid gap-2 sm:grid-cols-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!form.name.trim()) return;
                  updateContact(c.id, { name: form.name.trim(), title: form.title.trim() || undefined, company: form.company.trim() || undefined });
                  setEditing(false);
                  toast("Contact updated");
                }}
              >
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" aria-label="Name" autoFocus />
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" aria-label="Title" />
                <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company" aria-label="Company" />
                <div className="flex gap-2 sm:col-span-3">
                  <Button size="sm" variant="primary" type="submit">
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <h2 className="text-[1.375rem] font-semibold tracking-[-0.02em]">{c.name}</h2>
                <p className="mt-0.5 text-[0.8125rem] text-fg-2">{[c.title, c.company].filter(Boolean).join(" at ") || "No title or company"}</p>
                <p className="mt-1 text-xs text-fg-3">{convs[0] ? `Last interaction ${formatRelative(convs[0].lastMessageAt)} on ${PLATFORMS[convs[0].platform].name}` : "No conversations yet"}</p>
              </>
            )}
          </div>
          {!editing ? (
            <div className="flex items-center gap-1.5">
              <Button size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button size="sm" onClick={() => setMergeOpen(true)}>
                <GitMerge /> Merge
              </Button>
            </div>
          ) : null}
        </div>

        <label className="mt-5 flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-[0.8125rem] shadow-xs">
          <Crown className="size-4 text-warning" />
          <span className="flex-1">
            <span className="font-medium">VIP</span>
            <span className="block text-xs text-fg-3">Conversations with {c.name.split(" ")[0]} are always high priority and can break through quiet hours.</span>
          </span>
          <Switch checked={c.vip} onCheckedChange={(v) => updateContact(c.id, { vip: v })} aria-label="VIP" />
        </label>

        {suggestions.length > 0 ? (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-info/25 bg-info-soft px-4 py-3 text-xs">
            <GitMerge className="size-4 shrink-0 text-info" />
            <span className="flex-1 text-fg-2">
              Possible duplicate: <b className="font-medium text-fg">{(suggestions[0].a.id === c.id ? suggestions[0].b : suggestions[0].a).name}</b>. {suggestions[0].reason}.
            </span>
            <Button
              size="xs"
              variant="secondary"
              onClick={() => {
                setMergeTarget((suggestions[0].a.id === c.id ? suggestions[0].b : suggestions[0].a).id);
                setMergeOpen(true);
              }}
            >
              Review merge
            </Button>
          </div>
        ) : null}

        {/* Identities */}
        <h3 className="mb-2 mt-8 text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-fg-4">Reach {c.name.split(" ")[0]} on</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {c.emails.map((e) => (
            <Identity key={e} icon={<Mail className="size-3.5 text-fg-3" />} label="Email" value={e} />
          ))}
          {c.phones.map((p) => (
            <Identity key={p} icon={<Phone className="size-3.5 text-fg-3" />} label="Phone" value={p} />
          ))}
          {c.handles
            .filter((h) => !c.emails.includes(h.value) && !c.phones.includes(h.value))
            .map((h) => (
              <Identity key={`${h.platform}:${h.value}`} icon={<PlatformIcon platform={h.platform} size={14} />} label={`${PLATFORMS[h.platform].name}${h.accountId ? ` · via ${accounts.find((a) => a.id === h.accountId)?.label ?? ""}` : ""}`} value={h.value} />
            ))}
        </div>

        {c.mergedFrom.length > 0 ? (
          <>
            <h3 className="mb-2 mt-8 text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-fg-4">Merged records</h3>
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              {c.mergedFrom.map((m) => (
                <div key={m.id} className="flex items-center gap-3 border-b border-line-subtle px-4 py-2.5 text-[0.8125rem] last:border-b-0">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{m.name}</span> <span className="text-fg-3">{[...m.emails, ...m.handles.map((h) => h.value)].slice(0, 2).join(", ")}</span>
                  </span>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={async () => {
                      if (await confirm({ title: `Unmerge ${m.name}?`, description: "Their identities and conversations move back to a separate contact.", confirmLabel: "Unmerge" })) {
                        unmergeContact(c.id, m.id);
                        toast(`${m.name} unmerged`);
                      }
                    }}
                  >
                    <Split /> Unmerge
                  </Button>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {/* Conversations */}
        <h3 className="mb-2 mt-8 text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-fg-4">Conversations · {convs.length}</h3>
        {convs.length === 0 ? (
          <p className="text-[0.8125rem] text-fg-3">No conversations yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
            {convs.map((x) => (
              <Link key={x.id} href={inboxHref({ c: x.id })} className="flex items-center gap-3 border-b border-line-subtle px-4 py-2.5 last:border-b-0 hover:bg-hover">
                <PlatformIcon platform={x.platform} size={18} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[0.8125rem] font-medium">{x.kind === "channel" ? `#${x.title}` : x.title}</span>
                    <span className="shrink-0 text-xs text-fg-4">{PLATFORMS[x.platform].shortName} · {accounts.find((a) => a.id === x.accountId)?.label}</span>
                  </div>
                  <p className="truncate text-xs text-fg-3">{x.preview}</p>
                </div>
                <span className="shrink-0 text-[0.6875rem] text-fg-4">{formatListTime(x.lastMessageAt)}</span>
              </Link>
            ))}
          </div>
        )}

        {/* Follow-ups */}
        <div className="mb-2 mt-8 flex items-center justify-between">
          <h3 className="text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-fg-4">Follow-ups</h3>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              const due = new Date(now + 3 * 86_400_000);
              due.setHours(9, 0, 0, 0);
              addReminder({ kind: "follow_up", title: `Check in with ${c.name.split(" ")[0]}`, contactId: c.id, conversationId: convs[0]?.id, dueAt: due.toISOString(), source: "user" });
              toast("Follow-up added", { description: `In 3 days · ${formatDue(due.toISOString())}` });
            }}
          >
            <Plus /> Follow up in 3 days
          </Button>
        </div>
        {reminders.length === 0 ? (
          <p className="text-[0.8125rem] text-fg-3">No open follow-ups.</p>
        ) : (
          <ul className="space-y-1.5">
            {reminders.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-[0.8125rem]">
                <span className={cn("size-1.5 rounded-full", r.dueAt && new Date(r.dueAt).getTime() < now ? "bg-danger" : "bg-fg-4")} />
                <span className="flex-1">{r.title}</span>
                {r.dueAt ? <span className="text-xs text-fg-3">{formatDue(r.dueAt)}</span> : null}
              </li>
            ))}
          </ul>
        )}

        {/* Notes */}
        <h3 className="mb-2 mt-8 text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-fg-4">Notes</h3>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== c.notes && (updateContact(c.id, { notes }), toast("Notes saved"))}
          rows={4}
          placeholder={`Private notes about ${c.name.split(" ")[0]}…`}
          aria-label="Contact notes"
        />
      </div>

      <MergeDialog open={mergeOpen} onOpenChange={setMergeOpen} primary={c} target={mergeTarget} setTarget={setMergeTarget} onMerge={(id) => (mergeContacts(c.id, id), router.replace(`/contacts?id=${c.id}`))} />
    </section>
  );
}

function Identity({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 shadow-xs">
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-surface-sunken">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[0.6875rem] text-fg-3">{label}</div>
        <div className="truncate text-[0.8125rem] font-medium">{value}</div>
      </div>
      <IconButton
        size="xs"
        label={copied ? "Copied" : "Copy"}
        onClick={() => void navigator.clipboard?.writeText(value).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1200)))}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100"
      >
        {copied ? <Check /> : <Copy />}
      </IconButton>
    </div>
  );
}

function MergeDialog({
  open,
  onOpenChange,
  primary,
  target,
  setTarget,
  onMerge,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  primary: Contact;
  target: string | null;
  setTarget: (id: string | null) => void;
  onMerge: (id: string) => void;
}) {
  const contacts = useWorkspace((s) => s.contacts);
  const [q, setQ] = useState("");
  const other = contacts.find((c) => c.id === target);
  const candidates = contacts.filter((c) => c.id !== primary.id && (!q || c.name.toLowerCase().includes(q.toLowerCase())));
  const shared = other ? [...primary.emails.filter((e) => other.emails.includes(e)), ...primary.phones.filter((p) => other.phones.includes(p))] : [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Merge into ${primary.name}`} description="Combine two records for the same person. Merges can be undone at any time." size="md">
        <DialogBody>
          {!other ? (
            <>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find the duplicate contact" aria-label="Find contact" autoFocus />
              <div className="mt-2 max-h-[280px] overflow-y-auto scrollbar-thin">
                {candidates.map((c) => (
                  <button key={c.id} onClick={() => setTarget(c.id)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-hover">
                    <Avatar name={c.name} hue={c.avatarHue} size="sm" />
                    <span className="text-[0.8125rem] font-medium">{c.name}</span>
                    <span className="truncate text-xs text-fg-3">{c.emails[0] ?? c.handles[0]?.value}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[primary, other].map((c, i) => (
                  <div key={c.id} className="rounded-lg border border-line p-3">
                    <Badge tone={i === 0 ? "accent" : "neutral"}>{i === 0 ? "Keep" : "Merge in"}</Badge>
                    <div className="mt-2 flex items-center gap-2">
                      <Avatar name={c.name} hue={c.avatarHue} size="sm" />
                      <span className="text-[0.8125rem] font-semibold">{c.name}</span>
                    </div>
                    <ul className="mt-2 space-y-0.5 text-xs text-fg-3">
                      {[...c.emails, ...c.phones, ...c.handles.map((h) => `${PLATFORMS[h.platform].shortName}: ${h.value}`)].slice(0, 5).map((v) => (
                        <li key={v} className="truncate">
                          {v}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className={cn("rounded-md px-3 py-2 text-xs", shared.length ? "bg-success-soft text-fg-2" : "bg-warning-soft text-fg-2")}>
                {shared.length
                  ? `Strong match: both records share ${shared.join(", ")}.`
                  : "These records don't share an email address or phone number. Only merge if you're sure they're the same person. Orbit never merges on name alone."}
              </p>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {other ? (
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Choose another
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!other}
            onClick={() => {
              if (!other) return;
              onMerge(other.id);
              onOpenChange(false);
              toast(`Merged ${other.name} into ${primary.name}`, { description: "Unmerge anytime from Merged records." });
            }}
          >
            <GitMerge /> Merge contacts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
