"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { modKey } from "@/lib/utils";
import { useUI } from "@/store/ui";
import { useWorkspace } from "@/store/workspace";
import { CommandPalette } from "../command/command-palette";
import { ComposeWindow } from "../compose/compose-window";
import { NotificationCenter } from "../notifications/notification-center";
import { Dialog, DialogContent } from "../ui/dialog";
import { Kbd } from "../ui/kbd";

export function GlobalOverlays() {
  return (
    <>
      <ComposeWindow />
      <CommandPalette />
      <NotificationCenter />
      <ShortcutsDialog />
      <ScheduledDispatcher />
    </>
  );
}

/**
 * Sends scheduled messages from sample accounts when they come due while Orbit
 * is open. Live accounts are dispatched server-side by the scheduled-send job,
 * so they still go out when the app is closed.
 */
function ScheduledDispatcher() {
  useEffect(() => {
    const tick = async () => {
      const { scheduled, accounts, cancelScheduled, send } = useWorkspace.getState();
      const due = scheduled.filter((m) => new Date(m.sendAt).getTime() <= Date.now() && accounts.find((a) => a.id === m.accountId)?.isDemo);
      for (const m of due) {
        cancelScheduled(m.id);
        const r = await send({ clientId: `sched_${m.id}`, accountId: m.accountId, conversationId: m.conversationId, to: m.to, subject: m.subject, body: m.body, attachments: [] });
        if (r.ok) toast.success("Scheduled message sent", { description: m.to.join(", ") });
        else toast.error("Scheduled message failed", { description: r.error });
      }
    };
    void tick();
    const i = setInterval(tick, 20_000);
    return () => clearInterval(i);
  }, []);
  return null;
}

const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: "General",
    items: [
      [`${modKey()} K`, "Search & command palette"],
      ["/", "Search"],
      ["C", "Compose"],
      ["?", "Keyboard shortcuts"],
      [`${modKey()} \\`, "Toggle sidebar"],
      [`${modKey()} ,`, "Settings"],
    ],
  },
  {
    group: "Navigation",
    items: [
      ["G I", "All inbox"],
      ["G U", "Unread"],
      ["G S", "Starred"],
      ["G D", "Drafts"],
      ["G E", "Archived"],
      ["G T", "Sent"],
      ["G C", "Contacts"],
      ["G F", "Follow-ups"],
      ["G A", "Assistant"],
      ["G N", "Notifications"],
    ],
  },
  {
    group: "Conversation",
    items: [
      ["J / K", "Next / previous"],
      ["R", "Reply"],
      ["E", "Archive"],
      ["S", "Star"],
      ["U", "Mark read / unread"],
      ["H", "Snooze"],
      ["M", "Add reminder"],
      ["P", "Pin"],
      ["⇧ I", "Mark important"],
      ["]", "Toggle details panel"],
      ["Esc", "Close conversation"],
      [`${modKey()} ↵`, "Send"],
    ],
  },
];

function ShortcutsDialog() {
  const open = useUI((s) => s.shortcutsOpen);
  const setOpen = useUI((s) => s.setShortcuts);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Keyboard shortcuts" description="Orbit is built to be driven from the keyboard." size="lg">
        <div className="grid gap-x-8 gap-y-6 px-5 pb-6 pt-3 sm:grid-cols-3">
          {SHORTCUTS.map((g) => (
            <div key={g.group}>
              <h3 className="mb-2 text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-fg-4">{g.group}</h3>
              <ul className="space-y-1.5">
                {g.items.map(([k, label]) => (
                  <li key={label} className="flex items-center justify-between gap-3 text-[0.8125rem] text-fg-2">
                    <span>{label}</span>
                    <Kbd>{k}</Kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
