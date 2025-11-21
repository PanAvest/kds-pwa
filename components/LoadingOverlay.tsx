// components/LoadingOverlay.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type LoadingEventDetail = { id?: string; reason?: string; force?: boolean };

const INTERACTION_WINDOW_MS = 4000;
const SHOW_DELAY_MS = 120;
const HIDE_DELAY_MS = 140;
const FALLBACK_CLEAR_MS = 8000;

const EVENT_START = "kds:loading:start";
const EVENT_STOP = "kds:loading:stop";

const isInternalNav = (href: string) => {
  if (!href) return false;
  try {
    const url = new URL(href, window.location.href);
    const current = new URL(window.location.href);
    return url.origin === current.origin && (url.pathname !== current.pathname || url.search !== current.search);
  } catch {
    return false;
  }
};

const makeToken = () => `kds-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Global loading overlay:
 * - Activates for user-triggered navigation (Link clicks/back) and tracked async work.
 * - Listens to fetch(), custom events, and route changes to show/hide automatically.
 * - Never blocks taps (pointer-events-none) and sits above content without hiding the bottom tabs.
 */
export default function LoadingOverlay() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);
  const [visible, setVisible] = useState(false);

  const tokensRef = useRef<Set<string>>(new Set());
  const navTokenRef = useRef<string | null>(null);
  const interactionUntilRef = useRef<number>(0);

  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);

  const hasRecentInteraction = useCallback(() => Date.now() <= interactionUntilRef.current, []);

  const markInteraction = useCallback((extendMs = INTERACTION_WINDOW_MS) => {
    interactionUntilRef.current = Date.now() + extendMs;
  }, []);

  const startToken = useCallback(
    (requestedId?: string, force = false) => {
      if (!force && !hasRecentInteraction()) return null;
      const token = requestedId || makeToken();
      tokensRef.current.add(token);
      setPendingCount(tokensRef.current.size);
      return token;
    },
    [hasRecentInteraction],
  );

  const stopToken = useCallback((token?: string | null) => {
    if (!token) return;
    tokensRef.current.delete(token);
    setPendingCount(tokensRef.current.size);
  }, []);

  // Smooth visibility transitions
  useEffect(() => {
    if (pendingCount > 0) {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      showTimerRef.current = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    } else {
      if (showTimerRef.current) window.clearTimeout(showTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => setVisible(false), HIDE_DELAY_MS);
    }
    return () => {
      if (showTimerRef.current) window.clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [pendingCount]);

  // Safety: auto-clear if something never resolves
  useEffect(() => {
    if (!visible) {
      if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
      return;
    }
    fallbackTimerRef.current = window.setTimeout(() => {
      if (tokensRef.current.size === 0) setVisible(false);
    }, FALLBACK_CLEAR_MS);
    return () => {
      if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
    };
  }, [visible]);

  // Hide navigation token once route has changed
  useEffect(() => {
    if (navTokenRef.current) {
      stopToken(navTokenRef.current);
      navTokenRef.current = null;
    }
  }, [pathname, stopToken]);

  // Listen for explicit loading events
  useEffect(() => {
    const onStart = (event: Event) => {
      const detail = (event as CustomEvent<LoadingEventDetail>).detail || {};
      startToken(detail.id, detail.force ?? false);
    };
    const onStop = (event: Event) => {
      const detail = (event as CustomEvent<LoadingEventDetail>).detail || {};
      stopToken(detail.id);
    };

    window.addEventListener(EVENT_START, onStart as EventListener, true);
    window.addEventListener(EVENT_STOP, onStop as EventListener, true);
    return () => {
      window.removeEventListener(EVENT_START, onStart as EventListener, true);
      window.removeEventListener(EVENT_STOP, onStop as EventListener, true);
    };
  }, [startToken, stopToken]);

  // Track user interactions to qualify subsequent async work
  useEffect(() => {
    const mark = () => markInteraction();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") markInteraction();
    };
    window.addEventListener("pointerdown", mark, true);
    window.addEventListener("submit", mark, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", mark, true);
      window.removeEventListener("submit", mark, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [markInteraction]);

  // Navigation start detection (Link taps + back/forward)
  useEffect(() => {
    const beginNav = () => {
      markInteraction();
      if (!navTokenRef.current) navTokenRef.current = startToken(undefined, true);
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (!isInternalNav(anchor.href)) return;
      beginNav();
    };
    const onPopState = () => beginNav();

    window.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [markInteraction, startToken]);

  // Patch fetch to track user-triggered API calls/payment inits/etc.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const original = window.fetch;
    if ((original as any).__kdsPatched) return;

    const patched: typeof window.fetch = async (...args) => {
      const rawUrl = args[0];
      const url = typeof rawUrl === "string" ? rawUrl : rawUrl instanceof Request ? rawUrl.url : "";
      const ignore = url.includes("/_next/") || url.startsWith("data:");
      const token = ignore ? null : startToken(undefined, false);
      try {
        return await original(...args);
      } finally {
        if (token) stopToken(token);
      }
    };
    (patched as any).__kdsPatched = true;
    window.fetch = patched;

    return () => {
      window.fetch = original;
    };
  }, [startToken, stopToken]);

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[80] flex items-start justify-center pt-16 pb-20 transition-opacity duration-200 pointer-events-none ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{ backgroundColor: "rgba(254, 253, 250, 0.55)" }}
    >
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-white/90 px-4 py-3 shadow-lg border border-[color:var(--color-light)] backdrop-blur-sm">
        <div className="h-9 w-9 rounded-full border-2 border-[var(--color-accent-red)] border-t-transparent animate-spin" />
        <span className="text-[11px] font-semibold tracking-tight text-[color:var(--color-accent-red)]">
          Loading…
        </span>
      </div>
    </div>
  );
}
