"use client";

import { create } from "zustand";
import type { PlatformId } from "@/lib/types";

export interface ComposeState {
  open: boolean;
  minimized: boolean;
  platform?: PlatformId;
  accountId?: string;
  to?: string[];
  subject?: string;
  body?: string;
  draftId?: string;
  replyToConversationId?: string;
}

interface UIState {
  compose: ComposeState;
  paletteOpen: boolean;
  paletteQuery: string;
  shortcutsOpen: boolean;
  notificationsOpen: boolean;
  mobileNavOpen: boolean;
  /** Ids currently selected via shift/cmd-click or `x` in the list. */
  selection: string[];
  /** Ordered ids of the currently visible list (for j/k navigation). */
  visibleIds: string[];
  focusComposerTick: number;

  openCompose(init?: Partial<Omit<ComposeState, "open" | "minimized">>): void;
  closeCompose(): void;
  setCompose(patch: Partial<ComposeState>): void;
  setPalette(open: boolean, query?: string): void;
  setShortcuts(open: boolean): void;
  setNotifications(open: boolean): void;
  setMobileNav(open: boolean): void;
  setSelection(ids: string[]): void;
  toggleSelected(id: string): void;
  setVisibleIds(ids: string[]): void;
  focusComposer(): void;
}

export const useUI = create<UIState>()((set) => ({
  compose: { open: false, minimized: false },
  paletteOpen: false,
  paletteQuery: "",
  shortcutsOpen: false,
  notificationsOpen: false,
  mobileNavOpen: false,
  selection: [],
  visibleIds: [],
  focusComposerTick: 0,

  openCompose: (init) => set({ compose: { open: true, minimized: false, ...init } }),
  closeCompose: () => set({ compose: { open: false, minimized: false } }),
  setCompose: (patch) => set((s) => ({ compose: { ...s.compose, ...patch } })),
  setPalette: (open, query) => set((s) => ({ paletteOpen: open, paletteQuery: query ?? (open ? s.paletteQuery : "") })),
  setShortcuts: (open) => set({ shortcutsOpen: open }),
  setNotifications: (open) => set({ notificationsOpen: open }),
  setMobileNav: (open) => set({ mobileNavOpen: open }),
  setSelection: (ids) => set({ selection: ids }),
  toggleSelected: (id) => set((s) => ({ selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id] })),
  setVisibleIds: (ids) => set({ visibleIds: ids }),
  focusComposer: () => set((s) => ({ focusComposerTick: s.focusComposerTick + 1 })),
}));
