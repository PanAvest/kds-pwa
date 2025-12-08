"use client";

import { useEffect, useMemo, useState } from "react";
import { isNativeApp } from "@/lib/nativePlatform";

// Canonical origin for main site Storyline content
const MAIN_ORIGIN = (
  process.env.NEXT_PUBLIC_MAIN_SITE_ORIGIN || "https://panavestkds.com"
).replace(/\/+$/, "");

/**
 * Build a single absolute Storyline URL from whatever is stored in interactive_path.
 *
 * Accepts:
 *  - Full URLs: https://panavestkds.com/interactive/...
 *  - Relative paths: /interactive/ghie-business-ethics/ or interactive/ghie-business-ethics/
 *  - Direct HTML: /interactive/ghie-business-ethics/story_html5.html
 *
 * Always returns a full absolute URL pointing at story_html5.html under MAIN_ORIGIN.
 */
function buildInteractiveUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let trimmed = raw.trim();
  if (!trimmed) return null;

  // If admin already stored a full URL, use it directly.
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Treat as a path off the main origin.
  if (!trimmed.startsWith("/")) {
    trimmed = `/${trimmed}`;
  }

  // If there is no *.html at the end, assume a folder and append Storyline's main HTML file.
  const hasHtml = /\.html?$/i.test(trimmed);
  if (!hasHtml) {
    if (!trimmed.endsWith("/")) trimmed += "/";
    trimmed += "story_html5.html";
  }

  return `${MAIN_ORIGIN}${trimmed}`;
}

type InteractiveDashboardClientProps = {
  slug: string;
  title: string | null;
  deliveryMode: string | null;
  interactivePath: string | null;
};

export function InteractiveDashboardClient({
  slug,
  title,
  deliveryMode,
  interactivePath,
}: InteractiveDashboardClientProps) {
  const [native, setNative] = useState(false);
  const [iframeStatus, setIframeStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");

  // Decide final iframe src (same for web + native -> no proxy)
  const iframeSrc = useMemo(
    () => buildInteractiveUrl(interactivePath),
    [interactivePath]
  );

  useEffect(() => {
    try {
      setNative(isNativeApp());
    } catch {
      setNative(false);
    }
  }, []);

  useEffect(() => {
    if (iframeSrc) {
      setIframeStatus("loading");
    } else {
      setIframeStatus("idle");
    }
  }, [iframeSrc]);

  // iOS zoom-prevention injection inside the Storyline iframe
  useEffect(() => {
    if (iframeStatus !== "loaded") return;

    const iframeEl = document.querySelector("iframe");
    if (!iframeEl) return;

    try {
      const doc = iframeEl.contentDocument;
      const style = doc.createElement("style");
      style.innerHTML = `
      input, textarea, select {
        font-size: 16px !important;
        -webkit-text-size-adjust: 100% !important;
      }
    `;
      doc.head.appendChild(style);
    } catch (err) {
      console.log("No-zoom CSS injection skipped (cross-origin)", err);
    }
  }, [iframeStatus]);

  const showDebug = native || process.env.NODE_ENV !== "production";

  if (process.env.NODE_ENV !== "production") {
    console.log("[KDS interactive debug]", {
      slug,
      deliveryMode,
      interactivePath,
      iframeSrc,
      isNative: native,
      iframeStatus,
    });
  }

  return (
    <div className="mt-3">
      {/* Debug panel (always visible in native shell, dev-only on web) */}
      {showDebug && (
        <div className="mb-3 inline-flex max-w-full flex-col gap-1 rounded-xl bg-black/85 px-3 py-2 text-[10px] text-green-200">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">[INTERACTIVE DEBUG PANEL]</span>
            <span>
              iframeStatus:{" "}
              <span className="font-semibold">{iframeStatus}</span>
            </span>
          </div>
          <div>slug: {slug}</div>
          <div>deliveryMode: {deliveryMode ?? "null"}</div>
          <div>NODE_ENV: {process.env.NODE_ENV}</div>
          <div>native shell: {native ? "true" : "false"}</div>
          <div>DB interactivePath: {interactivePath || "null"}</div>
          <div>MAIN_ORIGIN: {MAIN_ORIGIN}</div>
          <div>iframeSrc: {iframeSrc || "null"}</div>
        </div>
      )}

      {deliveryMode !== "interactive" ? (
        <div className="rounded-xl border border-[color:var(--color-light)] bg-white px-4 py-3 text-sm">
          This knowledge module is not marked as interactive.
        </div>
      ) : !iframeSrc ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          This interactive program is not yet configured. Please contact
          support.
        </div>
      ) : (
        <div className="w-full rounded-2xl bg-white border border-[color:var(--color-light)] p-4">
          {/* Loading spinner */}
          {iframeStatus === "loading" && (
            <div className="w-full py-10 flex justify-center">
              <div className="animate-spin h-10 w-10 rounded-full border-4 border-blue-600 border-t-transparent"></div>
            </div>
          )}

          {/* Fade-in iframe */}
          <div
            className="w-full transition-opacity duration-300"
            style={{ opacity: iframeStatus === "loaded" ? 1 : 0 }}
          >
            <iframe
              src={iframeSrc}
              title={title ?? "Interactive knowledge"}
              className="w-full"
              style={{ border: "none", minHeight: "80vh" }}
              referrerPolicy="no-referrer"
              sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-downloads"
              allow="fullscreen; autoplay"
              allowFullScreen
              onLoad={() => {
                setIframeStatus("loaded");
                console.log("[KDS Interactive] iframe loaded");
              }}
              onError={() => {
                setIframeStatus("error");
                console.log("[KDS Interactive] iframe error");
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
