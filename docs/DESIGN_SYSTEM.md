# Orbit design system

## Direction

Orbit should feel like a quiet, precise instrument: dense like Linear, fast and keyboard-first like Superhuman, and as reachable from the keyboard as Raycast. It avoids decoration. Color marks state (unread, priority, failure), not ornament.

- **Warm graphite neutrals.** Surfaces are paper-like off-whites in light mode and warm near-blacks in dark mode, with no blue tint. This gives Orbit an identity distinct from the cool-grey/indigo SaaS look.
- **One accent.** Vermilion by default; moss, cobalt, amber and graphite are user-selectable. Every accent is tuned separately for light and dark contrast.
- **Brand colors appear only in platform tiles.** They identify the source (Gmail, Slack, …) and never tint layout.

## Tokens

All tokens live in `src/app/globals.css` and are exposed to Tailwind via `@theme inline`. Components use semantic utilities only (`bg-surface`, `text-fg-2`, `border-line`, `bg-accent-soft`), never raw colors.

| Token group | Tokens |
| --- | --- |
| Surfaces | `bg`, `surface`, `surface-sunken` (sidebar), `surface-raised` (menus, modals), `hover`, `active`, `selected`, `overlay` |
| Lines | `line-subtle`, `line`, `line-strong` |
| Text | `fg` (primary), `fg-2` (secondary), `fg-3` (tertiary/meta), `fg-4` (placeholder/disabled), `fg-inverse` |
| Accent | `accent`, `accent-hover`, `accent-text` (AA on surfaces), `accent-soft`, `accent-soft-2`, `accent-contrast` |
| Semantic | `success`, `warning`, `danger`, `info` + `*-soft` |
| Elevation | `shadow-xs` … `shadow-xl` (hairline ring + soft drop) |
| Radius | `xs 4` · `sm 6` (controls) · `md 8` (menus) · `lg 12` (dialogs) · `xl 16` |
| Density | `--row-py`, `--nav-h`, `--msg-gap` swap under `[data-density="compact"]` |

## Typography

Geist Sans / Geist Mono. The base UI size is **13px** (`text-sm`), set for dense, scannable lists.

| Use | Size / weight |
| --- | --- |
| Meta, timestamps, counts | 11–12px, `fg-3`, tabular numerals |
| Body, list rows, controls | 13px |
| Message bodies | 14px (`text-base`) for reading comfort |
| Section titles | 15px semibold, −0.01em tracking |
| Page titles | 20–22px semibold, −0.02em tracking |

## Motion

- 120–220ms, `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out) for entrances and `ease-in-out` for state swaps.
- Motion explains a state change (a row leaving on archive, a message settling from pending to sent, a panel opening). It never loops for decoration.
- `prefers-reduced-motion` disables all animation.

## Interaction principles

1. **Every action has a keyboard path.** Press `?` for the shortcut sheet and `⌘K` for the command palette.
2. **Every visible control works.** Unsupported actions are absent or disabled with a reason, never silently inert.
3. **Optimistic but honest.** State changes (star, archive, read) are instant and undoable. Sends are never shown as sent until confirmed.
4. **Platform-native presentation.** Email keeps subjects, recipients and thread structure. Chats render as bubbles. Slack keeps channels, threads and reactions. LinkedIn renders as professional messages.
5. **Explain the machine.** Priority badges show their reasons, search shows how it interpreted your query, and the AI shows what it read.

## Layout

Three panels at ≥1280px: sidebar (244px, collapsible to a 52px rail) · conversation list (360–400px) · conversation view (flex) with an optional 300px contact panel.

- 1024–1280px: the contact panel becomes an overlay.
- 768–1024px: list and conversation are stacked views with a back action.
- <768px: the sidebar becomes a drawer, and touch targets are ≥36px.
