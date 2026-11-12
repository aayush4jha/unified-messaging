import type { FolderView } from "./types";

export interface InboxRoute {
  folder?: FolderView;
  account?: string;
  label?: string;
  c?: string;
}

export function inboxHref(r: InboxRoute = {}): string {
  const p = new URLSearchParams();
  if (r.account) p.set("account", r.account);
  else if (r.label) p.set("label", r.label);
  else if (r.folder && r.folder !== "all") p.set("folder", r.folder);
  if (r.c) p.set("c", r.c);
  const qs = p.toString();
  return qs ? `/inbox?${qs}` : "/inbox";
}

export const FOLDERS: { id: FolderView; label: string; shortcut?: string }[] = [
  { id: "all", label: "All Inbox", shortcut: "G I" },
  { id: "unread", label: "Unread", shortcut: "G U" },
  { id: "starred", label: "Starred", shortcut: "G S" },
  { id: "important", label: "Important" },
  { id: "drafts", label: "Drafts", shortcut: "G D" },
  { id: "scheduled", label: "Scheduled" },
  { id: "archived", label: "Archived", shortcut: "G E" },
  { id: "sent", label: "Sent", shortcut: "G T" },
];

export function isFolder(v: string | null): v is FolderView {
  return !!v && FOLDERS.some((f) => f.id === v);
}
