// components/LoadingOverlay.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const SHOW_DELAY_MS = 100;
const HIDE_DELAY_MS = 140;
const FALLBACK_CLEAR_MS = 6000;

const isInternalNav = (href: string, current: string) => {
  if (!href) return false;
  try {
    const target = new URL(href, window.location.href);
    const here = new URL(current, window.location.href);
    return target.origin === here.origin && (target.pathname !== here.pathname || target.search !== here.search);
  } catch {
    return false;
  }
};

/**
 * Global loading overlay:
 * - Activates only for route transitions (Link taps, back/forward).
 * - Ignores inline async fetches/forms; keeps bottom tabs usable.
 */
export default function LoadingOverlay() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const lastPathRef = useRef(pathname);

  const triggerShow = () => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    showTimerRef.current = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = window.setTimeout(() => setVisible(false), FALLBACK_CLEAR_MS);
  };
  const triggerHide = () => {
    if (showTimerRef.current) window.clearTimeout(showTimerRef.current);
    if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setVisible(false), HIDE_DELAY_MS);
  };

  // Detect navigation intent
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (!isInternalNav(anchor.href, window.location.href)) return;
      triggerShow();
    };
    const onPopState = () => triggerShow();

    window.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  // Hide when route changes
  useEffect(() => {
    if (lastPathRef.current !== pathname) {
      lastPathRef.current = pathname;
      triggerHide();
    }
  }, [pathname]);

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
