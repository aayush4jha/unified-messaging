"use client";

/**
 * Touch gestures for the phone apps. Each one only reacts to touch input, so
 * mouse and keyboard behavior on desktop is unchanged. Movement is applied
 * straight to the element's style (no React re-render per frame).
 */
import { useEffect, useRef, useState, type RefObject } from "react";

/** A short vibration on Android (iOS web apps have no vibration API). */
export function haptic(ms = 10) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not allowed before user activation */
  }
}

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/* ------------------------------------------------------------ Swipe a list row */

export interface SwipeVisual {
  side: "left" | "right" | null;
  armed: boolean;
}

/**
 * Swipe a row sideways to act on it. Swiping left past the threshold flies the
 * row out and calls `onLeft` (archive); swiping right calls `onRight` and
 * springs back (toggle read). Taps right after a swipe are swallowed so the
 * row's link doesn't open.
 */
export function useSwipeRow(opts: { onLeft?: () => void; onRight?: () => void; threshold?: number }) {
  const track = useRef<HTMLDivElement>(null);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });
  const gesture = useRef<{ id: number; x: number; y: number; axis: "x" | null; dx: number; armed: boolean } | null>(null);
  const swipedAt = useRef(0);
  const [visual, setVisual] = useState<SwipeVisual>({ side: null, armed: false });
  const threshold = opts.threshold ?? 84;

  const place = (x: number, animate: boolean) => {
    const el = track.current;
    if (!el) return;
    el.style.transition = animate ? `transform 220ms ${EASE}` : "none";
    el.style.transform = x ? `translate3d(${x}px,0,0)` : "";
  };

  const end = (e: React.PointerEvent, cancelled: boolean) => {
    const s = gesture.current;
    if (!s || s.id !== e.pointerId) return;
    gesture.current = null;
    if (s.axis !== "x") return;
    swipedAt.current = Date.now();
    const action = !cancelled && s.armed ? (s.dx < 0 ? optsRef.current.onLeft : optsRef.current.onRight) : undefined;
    if (action && s.dx < 0) {
      place(-(track.current?.offsetWidth ?? 420), true);
      setTimeout(() => {
        action();
        place(0, false);
        setVisual({ side: null, armed: false });
      }, 190);
      return;
    }
    place(0, true);
    action?.();
    setTimeout(() => setVisual({ side: null, armed: false }), 220);
  };

  const bind = {
    ref: track,
    style: { touchAction: "pan-y pinch-zoom" } as React.CSSProperties,
    onPointerDown(e: React.PointerEvent) {
      if (e.pointerType !== "touch" || gesture.current) return;
      gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null, dx: 0, armed: false };
    },
    onPointerMove(e: React.PointerEvent) {
      const s = gesture.current;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!s.axis) {
        if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
          gesture.current = null; // a scroll, not a swipe
          return;
        }
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
        s.axis = "x";
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      }
      let x = dx;
      if ((x < 0 && !optsRef.current.onLeft) || (x > 0 && !optsRef.current.onRight)) x = 0;
      const abs = Math.abs(x);
      if (abs > threshold) x = Math.sign(x) * (threshold + (abs - threshold) * 0.35); // resistance past the threshold
      s.dx = x;
      place(x, false);
      const armed = x !== 0 && Math.abs(dx) >= threshold;
      if (armed && !s.armed) haptic(8);
      s.armed = armed;
      const side = x < 0 ? "left" : x > 0 ? "right" : null;
      setVisual((v) => (v.side === side && v.armed === armed ? v : { side, armed }));
    },
    onPointerUp: (e: React.PointerEvent) => end(e, false),
    onPointerCancel: (e: React.PointerEvent) => end(e, true),
    onClickCapture(e: React.MouseEvent) {
      if (Date.now() - swipedAt.current < 400) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };

  return { bind, visual };
}

/* ------------------------------------------------------------ Pull to refresh */

/**
 * Pull down at the top of a scroll container to refresh. Returns the pull
 * distance (px) for the indicator. Only the component calling this re-renders.
 */
export function usePullToRefresh(scrollRef: RefObject<HTMLElement | null>, onRefresh: () => Promise<unknown>, enabled = true) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const cb = useRef(onRefresh);
  useEffect(() => {
    cb.current = onRefresh;
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return;
    const TRIGGER = 64;
    let startY: number | null = null;
    let startX = 0;
    let current = 0;
    let busy = false;
    const reset = () => {
      current = 0;
      setPull(0);
    };
    const start = (e: TouchEvent) => {
      if (busy || el.scrollTop > 0 || e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      current = 0;
    };
    const move = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;
      if (dy <= 0 || el.scrollTop > 0 || (current === 0 && Math.abs(dx) > dy)) {
        startY = null;
        if (current) reset();
        return;
      }
      const next = Math.min(110, dy * 0.5);
      if (next >= TRIGGER && current < TRIGGER) haptic(10);
      current = next;
      setPull(next);
    };
    const end = async () => {
      if (startY === null) return;
      startY = null;
      if (current < TRIGGER) return reset();
      busy = true;
      setRefreshing(true);
      setPull(56);
      try {
        await cb.current();
      } finally {
        busy = false;
        setRefreshing(false);
        reset();
      }
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: true });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [scrollRef, enabled]);

  return { pull, refreshing, progress: Math.min(1, pull / 64) };
}

/* ------------------------------------------------------------ Edge swipe back */

/**
 * iOS-style back gesture for the stacked phone layout: drag from the left edge
 * and the view follows your finger. Only enabled for the installed iPhone app,
 * which (unlike Safari and Android) has no system back gesture.
 */
export function useEdgeSwipeBack(ref: RefObject<HTMLElement | null>, onBack: () => void, enabled: boolean) {
  const cb = useRef(onBack);
  useEffect(() => {
    cb.current = onBack;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let s: { x: number; y: number; active: boolean } | null = null;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      // Stacked (phone) layout only; on wide screens the list stays visible beside the conversation.
      if (e.touches.length !== 1 || t.clientX > 28 || window.innerWidth >= 1024) return;
      s = { x: t.clientX, y: t.clientY, active: false };
    };
    const move = (e: TouchEvent) => {
      if (!s) return;
      const t = e.touches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (!s.active) {
        if (Math.abs(dy) > 14 && Math.abs(dy) > dx) {
          s = null;
          return;
        }
        if (dx < 12) return;
        s.active = true;
      }
      el.style.transition = "none";
      el.style.transform = `translate3d(${Math.max(0, dx)}px,0,0)`;
    };
    const end = (e: TouchEvent) => {
      if (!s) return;
      const dx = (e.changedTouches[0]?.clientX ?? s.x) - s.x;
      const active = s.active;
      s = null;
      if (!active) return;
      if (dx > Math.min(120, el.offsetWidth * 0.3)) {
        el.style.transition = `transform 170ms ${EASE}`;
        el.style.transform = `translate3d(${el.offsetWidth}px,0,0)`;
        setTimeout(() => cb.current(), 150);
      } else {
        el.style.transition = `transform 200ms ${EASE}`;
        el.style.transform = "";
      }
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: true });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
      el.style.transform = "";
    };
  }, [ref, enabled]);
}
