"use client";

import { useEffect, useRef } from "react";

/**
 * Minimal keyboard shortcut engine.
 *
 * Keys: "c", "?", "shift+i", "mod+k" (⌘ on macOS, Ctrl elsewhere), "escape",
 * and two-key sequences like "g i". Plain-key shortcuts are ignored while
 * typing in inputs; `mod+` shortcuts and Escape always fire.
 */
export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable || !!el.closest("[cmdk-root]");
}

function normalize(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("mod");
  if (e.altKey) parts.push("alt");
  let key = e.key.toLowerCase();
  if (key === " ") key = "space";
  // Shift is implied by the produced character for symbols like "?" or "#".
  if (e.shiftKey && /^[a-z]$/.test(key)) parts.push("shift");
  if (key === "esc") key = "escape";
  parts.push(key);
  return parts.join("+");
}

export function useHotkeys(map: HotkeyMap, enabled = true) {
  const mapRef = useRef(map);
  useEffect(() => {
    mapRef.current = map;
  });

  useEffect(() => {
    if (!enabled) return;
    let pending: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const combo = normalize(e);
      const typing = isTypingTarget(e.target);
      const isMod = combo.startsWith("mod+");
      if (typing && !isMod && combo !== "escape") return;
      // Don't hijack shortcuts while a dialog/menu (other than our own targets) owns focus
      const inDialog = e.target instanceof HTMLElement && !!e.target.closest("[role=dialog],[role=menu],[role=listbox]");
      if (inDialog && !isMod) return;

      const handlers = mapRef.current;
      if (pending) {
        const seq = `${pending} ${combo}`;
        pending = null;
        if (timer) clearTimeout(timer);
        if (handlers[seq]) {
          e.preventDefault();
          handlers[seq](e);
          return;
        }
      }
      if (Object.keys(handlers).some((k) => k.startsWith(`${combo} `))) {
        pending = combo;
        timer = setTimeout(() => (pending = null), 900);
        return;
      }
      const h = handlers[combo];
      if (h) {
        e.preventDefault();
        h(e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);
}
