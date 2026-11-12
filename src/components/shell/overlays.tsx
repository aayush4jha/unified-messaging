"use client";

import { modKey } from "@/lib/utils";
import { useUI } from "@/store/ui";
import { Dialog, DialogContent } from "../ui/dialog";
import { Kbd } from "../ui/kbd";

export function GlobalOverlays() {
  return <ShortcutsDialog />;
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
