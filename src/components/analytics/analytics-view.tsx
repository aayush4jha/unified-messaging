"use client";

import { format } from "date-fns";
import { Info } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { computeAnalytics, formatMinutes } from "@/lib/intelligence/analytics";
import { PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import { useNow } from "@/store/selectors";
import { useWorkspace } from "@/store/workspace";
import { PlatformIcon } from "../brand/platform-icon";
import { PageHeader } from "../shell/page-header";
import { Avatar } from "../ui/avatar";
import { Segmented } from "../ui/controls";
import { EmptyState } from "../ui/empty";

type Range = "7" | "14" | "30";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function AnalyticsView() {
  const now = useNow();
  const conversations = useWorkspace((s) => s.conversations);
  const messages = useWorkspace((s) => s.messages);
  const accounts = useWorkspace((s) => s.accounts);
  const contacts = useWorkspace((s) => s.contacts);
  const mode = useWorkspace((s) => s.mode);
  const [range, setRange] = useState<Range>("14");
  const [showTable, setShowTable] = useState(false);

  const a = useMemo(() => computeAnalytics({ conversations, messages, accounts, contacts, rangeDays: Number(range), now }), [conversations, messages, accounts, contacts, range, now]);
  const maxPlatform = Math.max(1, ...a.byPlatform.map((p) => p.received + p.sent));
  const maxHour = Math.max(1, ...a.hourly.map((h) => h.count));

  if (accounts.length === 0) {
    return (
      <div className="flex h-full flex-col bg-bg">
        <PageHeader title="Analytics" />
        <EmptyState title="No data yet" description="Analytics are computed from synced messages. Connect an account to get started." />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <PageHeader
        title="Analytics"
        description={mode === "demo" ? "Computed from sample data" : "Computed from your synced messages"}
        actions={
          <Segmented
            size="xs"
            value={range}
            onChange={setRange}
            ariaLabel="Date range"
            options={[
              { value: "7", label: "7 days" },
              { value: "14", label: "14 days" },
              { value: "30", label: "30 days" },
            ]}
          />
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-[1040px] space-y-5 px-4 py-6 sm:px-8">
          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Messages received" value={a.totals.received.toLocaleString()} hint={`Last ${range} days`} />
            <Tile label="Messages sent" value={a.totals.sent.toLocaleString()} hint={`Last ${range} days`} />
            <Tile label="Median response time" value={formatMinutes(a.responseTime.medianMinutes)} hint={a.responseTime.samples ? `From ${a.responseTime.samples} replies` : "No replies in range"} />
            <Tile label="Awaiting your reply" value={String(a.totals.awaitingYou)} hint="Unread, last message from them" />
          </div>

          {/* Daily volume */}
          <Panel
            title="Daily activity"
            subtitle="Messages received and sent per day"
            action={
              <button className="text-xs font-medium text-fg-3 hover:text-fg" onClick={() => setShowTable((v) => !v)}>
                {showTable ? "Show chart" : "Show table"}
              </button>
            }
          >
            <div className="mb-3 flex items-center gap-4 text-xs text-fg-2" aria-hidden={showTable}>
              <LegendKey color="var(--series-1)" label="Received" />
              <LegendKey color="var(--series-2)" label="Sent" />
            </div>
            {showTable ? (
              <div className="max-h-[260px] overflow-y-auto scrollbar-thin">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-surface text-fg-3">
                    <tr>
                      <th className="py-1.5 font-medium">Day</th>
                      <th className="py-1.5 text-right font-medium">Received</th>
                      <th className="py-1.5 text-right font-medium">Sent</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {a.daily.map((d) => (
                      <tr key={d.date} className="border-t border-line-subtle">
                        <td className="py-1.5">{format(new Date(d.date + "T12:00:00"), "EEE, MMM d")}</td>
                        <td className="py-1.5 text-right">{d.received}</td>
                        <td className="py-1.5 text-right">{d.sent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-[240px]" role="img" aria-label={`Bar chart of messages received and sent per day over the last ${range} days`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={a.daily} barGap={2} barCategoryGap={range === "30" ? "18%" : "28%"} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                    <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={{ fill: "var(--text-3)", fontSize: 11 }} interval={range === "30" ? 3 : 0} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--text-3)", fontSize: 11 }} width={40} />
                    <RTooltip cursor={{ fill: "var(--hover)" }} content={<DayTooltip />} />
                    <Bar dataKey="received" name="Received" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                    <Bar dataKey="sent" name="Sent" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Platforms */}
            <Panel title="By platform" subtitle="Messages in range">
              {a.byPlatform.length === 0 ? (
                <p className="py-6 text-center text-xs text-fg-3">No messages in this range.</p>
              ) : (
                <ul className="space-y-2.5">
                  {a.byPlatform.map((p) => {
                    const total = p.received + p.sent;
                    return (
                      <li key={p.platform} className="group relative" title={`${PLATFORMS[p.platform].name}: ${p.received} received · ${p.sent} sent`}>
                        <div className="mb-1 flex items-center gap-2 text-xs">
                          <PlatformIcon platform={p.platform} size={14} />
                          <span className="font-medium text-fg">{PLATFORMS[p.platform].name}</span>
                          <span className="tabular ml-auto text-fg-2">{total}</span>
                        </div>
                        <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-surface-sunken">
                          <span className="h-full rounded-l-full bg-[var(--series-1)] transition-[width] duration-300" style={{ width: `${(p.received / maxPlatform) * 100}%` }} />
                          <span className="h-full rounded-r-full bg-[var(--series-2)] transition-[width] duration-300" style={{ width: `${(p.sent / maxPlatform) * 100}%` }} />
                        </div>
                        <div className="pointer-events-none absolute -top-7 right-0 rounded-[6px] bg-fg px-2 py-1 text-[0.6875rem] text-fg-inverse opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                          {p.received} received · {p.sent} sent
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            {/* Response time */}
            <Panel title="Response time" subtitle="Median time from their message to your reply">
              {a.responseTime.byPlatform.length === 0 ? (
                <p className="py-6 text-center text-xs text-fg-3">No replies in this range to measure.</p>
              ) : (
                <table className="w-full text-[0.8125rem]">
                  <tbody>
                    {a.responseTime.byPlatform
                      .sort((x, y) => x.medianMinutes - y.medianMinutes)
                      .map((r) => (
                        <tr key={r.platform} className="border-b border-line-subtle last:border-b-0">
                          <td className="py-2">
                            <span className="flex items-center gap-2">
                              <PlatformIcon platform={r.platform} size={14} /> {PLATFORMS[r.platform].name}
                            </span>
                          </td>
                          <td className="tabular py-2 text-right font-semibold">{formatMinutes(r.medianMinutes)}</td>
                          <td className="tabular w-24 py-2 text-right text-xs text-fg-3">{r.samples} repl{r.samples === 1 ? "y" : "ies"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            {/* Heatmap */}
            <Panel title="When conversations happen" subtitle="Messages by weekday and hour">
              <div className="overflow-x-auto scrollbar-thin">
                <div className="min-w-[520px]">
                  <div className="grid grid-cols-[32px_repeat(24,1fr)] gap-[2px]">
                    {DAYS.map((d, di) => (
                      <HeatRow key={d} day={d} cells={Array.from({ length: 24 }, (_, h) => a.hourly.find((x) => x.day === di && x.hour === h)?.count ?? 0)} max={maxHour} />
                    ))}
                    <span />
                    {Array.from({ length: 24 }, (_, h) => (
                      <span key={h} className="pt-1 text-center text-[0.625rem] text-fg-4">
                        {h % 6 === 0 ? (h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`) : ""}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[0.6875rem] text-fg-3">
                    Fewer
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <span key={i} className="size-2.5 rounded-[2px]" style={{ background: `var(--seq-${i})` }} />
                    ))}
                    More
                  </div>
                </div>
              </div>
            </Panel>

            {/* Contacts */}
            <Panel title="Most active contacts" subtitle="By messages exchanged">
              {a.topContacts.length === 0 ? (
                <p className="py-6 text-center text-xs text-fg-3">No contact activity in range.</p>
              ) : (
                <ul className="space-y-2">
                  {a.topContacts.map((c) => {
                    const contact = contacts.find((x) => x.id === c.contactId);
                    return (
                      <li key={c.contactId} className="flex items-center gap-2.5">
                        <Avatar name={c.name} hue={contact?.avatarHue} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">{c.name}</span>
                        <span className="tabular text-xs text-fg-2">{c.messages}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>

          {/* Honest limitations */}
          <div className="flex gap-3 rounded-lg border border-line bg-surface-sunken px-4 py-3 text-xs leading-[1.125rem] text-fg-3">
            <Info className="mt-px size-4 shrink-0 text-fg-3" />
            <div className="space-y-1">
              <p>
                <span className="font-medium text-fg-2">Coverage:</span> based on {Object.values(messages).reduce((n, m) => n + m.length, 0)} synced messages
                {a.earliestMessageAt ? ` since ${format(new Date(a.earliestMessageAt), "MMM d")}` : ""}. Ranges longer than the synced history show only what&apos;s available.
              </p>
              <p>
                <span className="font-medium text-fg-2">Unread trend isn&apos;t shown</span> because providers don&apos;t expose historical unread counts. Orbit records a daily snapshot from the day an account is connected, and the trend appears once a week of snapshots exists.
              </p>
              <p>Response times exclude channels and group chats, where it&apos;s unclear who a reply is to.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3.5 shadow-xs">
      <div className="text-xs text-fg-3">{label}</div>
      <div className="tabular mt-1 text-[1.625rem] font-semibold leading-8 tracking-[-0.025em]">{value}</div>
      {hint ? <div className="mt-0.5 text-[0.6875rem] text-fg-4">{hint}</div> : null}
    </div>
  );
}

function Panel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4 shadow-xs">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[0.875rem] font-semibold tracking-[-0.01em]">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-fg-3">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-[3px]" style={{ background: color }} /> {label}
    </span>
  );
}

function DayTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface-raised px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-fg">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-fg-2">
          <span className="size-2 rounded-[2px]" style={{ background: p.color }} />
          {p.name}
          <span className="tabular ml-auto pl-4 font-medium text-fg">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function HeatRow({ day, cells, max }: { day: string; cells: number[]; max: number }) {
  return (
    <>
      <span className="pr-1 text-right text-[0.625rem] leading-[14px] text-fg-4">{day}</span>
      {cells.map((count, h) => {
        const step = count === 0 ? 0 : Math.max(1, Math.ceil((count / max) * 6));
        return (
          <span
            key={h}
            className={cn("group relative h-[14px] rounded-[3px]")}
            style={{ background: `var(--seq-${step})` }}
            role="img"
            aria-label={`${day} ${h}:00, ${count} messages`}
          >
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-[6px] bg-fg px-2 py-1 text-[0.6875rem] text-fg-inverse shadow-md group-hover:block">
              {day} {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`} · {count} message{count === 1 ? "" : "s"}
            </span>
          </span>
        );
      })}
    </>
  );
}
