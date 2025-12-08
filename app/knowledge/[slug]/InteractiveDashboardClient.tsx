"use client";

import { useEffect, useMemo, useState } from "react";
import { isNativeApp } from "@/lib/nativePlatform";

type InteractiveDebugInfo = {
  ok?: boolean;
  status?: number;
  statusText?: string;
  contentType?: string | null;
  finalUrl?: string;
  mainOrigin?: string;
  raw?: string | null;
  relative?: string | null;
  absolute?: string | null;
  reason?: string;
  error?: string;
};

const MAIN_ORIGIN = (
  process.env.NEXT_PUBLIC_MAIN_SITE_ORIGIN || "https://panavestkds.com"
).replace(/\/+$/, "");

function buildInteractivePaths(raw: string | null | undefined) {
  if (!raw) {
    return { relative: null as string | null, absolute: null as string | null };
  }

  let trimmed = raw.trim();
  if (!trimmed) {
    return { relative: null, absolute: null };
  }

  // If admin already stored a full URL, just use it as-is
  if (/^https?:\/\//i.test(trimmed)) {
    return { relative: trimmed, absolute: trimmed };
  }

  // Treat as a relative path from the main site root
  if (!trimmed.startsWith("/")) {
    trimmed = `/${trimmed}`;
  }

  // If they gave a folder, default to Storyline's main HTML
  const hasHtml = /\.html?$/i.test(trimmed);
  let relativePath = trimmed;
  if (!hasHtml) {
    // e.g. /interactive/boardroom-governance -> /interactive/boardroom-governance/story_html5.html
    if (!relativePath.endsWith("/")) {
      relativePath = `${relativePath}/`;
    }
    relativePath = `${relativePath}story_html5.html`;
  }

  const absoluteUrl = `${MAIN_ORIGIN}${relativePath}`;

  return {
    relative: relativePath,
    absolute: absoluteUrl,
  };
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

  const [debugInfo, setDebugInfo] = useState<InteractiveDebugInfo | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);

  const { relative, absolute } = useMemo(
    () => buildInteractivePaths(interactivePath),
    [interactivePath]
  );

  // Decide what src the iframe should use
  const iframeSrc = useMemo(() => {
    if (!relative || !absolute) return null;

    // On native shells, always go through the proxy so origin is kds-pwa
    if (native) {
      const encoded = encodeURIComponent(relative);
      return `/api/interactive/proxy?path=${encoded}`;
    }

    // On web/PWA, hit the main site directly
    return absolute;
  }, [native, relative, absolute]);

  // Detect native shell
  useEffect(() => {
    try {
      setNative(isNativeApp());
    } catch {
      setNative(false);
    }
  }, []);

  // Track iframe loading state
  useEffect(() => {
    if (iframeSrc) {
      setIframeStatus("loading");
    } else {
      setIframeStatus("idle");
    }
  }, [iframeSrc]);

  // Hit debug API to test upstream Storyline URL
  useEffect(() => {
    let cancelled = false;

    if (!interactivePath) {
      setDebugInfo(null);
      return;
    }

    (async () => {
      try {
        setDebugLoading(true);
        const res = await fetch(
          `/api/interactive/debug?path=${encodeURIComponent(interactivePath)}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!cancelled) {
          setDebugInfo(json);
        }

        if (!cancelled && process.env.NODE_ENV !== "production") {
          console.log("[KDS interactive debug API]", json);
        }
      } catch (e) {
        if (!cancelled) {
          setDebugInfo({
            ok: false,
            error: (e as Error).message,
          });
        }
      } finally {
        if (!cancelled) {
          setDebugLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [interactivePath]);

  useEffect(() => {
    function onInteractivePing(e: any) {
      console.log("[KDS Interactive] Progress ping:", e.detail);

      // Optional: You may connect this to Supabase in the future,
      // e.g. to auto-mark the slide as opened.
    }

    window.addEventListener("interactive-progress", onInteractivePing);
    return () => window.removeEventListener("interactive-progress", onInteractivePing);
  }, []);

  // Console debug
  if (process.env.NODE_ENV !== "production") {
    console.log("[KDS interactive debug]", {
      slug,
      deliveryMode,
      interactivePath,
      relative,
      absolute,
      iframeSrc,
      isNative: native,
    });
  }

  useEffect(() => {
    if (!native) return;
    console.log("[KDS PWA interactive native debug]", {
      slug,
      deliveryMode,
      interactivePath,
      relative,
      absolute,
      iframeSrc,
    });
  }, [slug, deliveryMode, interactivePath, relative, absolute, iframeSrc, native]);

  return (
    <div className="mt-3">
      {/* Debug panel: always visible on native; dev-only on web */}
      {(process.env.NODE_ENV !== "production" || native) && (
        <div className="mb-3 rounded-xl bg-slate-900 text-[10px] text-slate-100 p-3 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">[INTERACTIVE DEBUG PANEL]</span>
            <span>
              iframeStatus: <b>{iframeStatus}</b>
            </span>
          </div>
          <div>slug: <code>{slug}</code></div>
          <div>deliveryMode: <code>{deliveryMode || "null"}</code></div>
          <div>NODE_ENV: <code>{process.env.NODE_ENV}</code></div>
          <div>native shell: <code>{String(native)}</code></div>
          <div>
            DB interactivePath: <code>{interactivePath || "null"}</code>
          </div>
          <div>
            MAIN_ORIGIN: <code>{debugInfo?.mainOrigin || MAIN_ORIGIN}</code>
          </div>
          <div>
            normalized relative: <code>{debugInfo?.relative || relative || "null"}</code>
          </div>
          <div className="truncate">
            normalized absolute: <code>{debugInfo?.absolute || absolute || "null"}</code>
          </div>
          <div className="truncate">
            iframeSrc: <code>{iframeSrc || "null"}</code>
          </div>
          <div>
            upstream status:{" "}
            {debugLoading
              ? "loading…"
              : `${debugInfo?.status ?? "?"} ${debugInfo?.statusText ?? ""}`}
          </div>
          <div>
            upstream ok:{" "}
            {debugInfo?.ok === undefined ? "?" : String(debugInfo.ok)}
          </div>
          <div>
            content-type: <code>{debugInfo?.contentType || "n/a"}</code>
          </div>
          <div className="truncate">
            finalUrl: <code>{debugInfo?.finalUrl || "n/a"}</code>
          </div>
          {debugInfo?.reason && (
            <div className="text-amber-300">
              reason: {debugInfo.reason}
            </div>
          )}
          {debugInfo?.error && (
            <div className="text-red-300">
              error: {debugInfo.error}
            </div>
          )}
        </div>
      )}

      {native && iframeSrc && (
        <div className="mt-3">
          <a
            href={absolute}
            target="_blank"
            rel="noreferrer"
            className="text-xs underline text-blue-700"
          >
            If the module does not appear, tap here to open it externally.
          </a>
        </div>
      )}

      {deliveryMode !== "interactive" ? (
        <div className="rounded-xl border border-[color:var(--color-light)] bg-white px-4 py-3 text-sm">
          This knowledge module is not marked as interactive.
        </div>
      ) : !iframeSrc ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          This interactive program is not yet configured. Please contact support.
        </div>
      ) : (
        <div className="w-full rounded-2xl bg-white border border-[color:var(--color-light)] p-4">
          <iframe
            src={iframeSrc}
            title={title ?? "Interactive knowledge"}
            className="w-full"
            style={{ border: "none", minHeight: "85vh" }}
            referrerPolicy="no-referrer"
            sandbox="
    allow-same-origin
    allow-scripts
    allow-forms
    allow-popups
    allow-modals
    allow-downloads
  "
            allow="fullscreen *; autoplay *; clipboard-read; clipboard-write"
            allowFullScreen
            onLoad={() => {
              setIframeStatus("loaded");

              // Log inside native shells
              if (native) {
                console.log("[KDS Interactive] iframe loaded:", iframeSrc);
              }

              // Fire a “progress ping” so we can save that the interactive module was opened
              try {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("interactive-progress", {
                    detail: { slug, timestamp: Date.now() }
                  }));
                }
              } catch (err) {
                console.log("[KDS interactive progress ping failed]", err);
              }
            }}
            onError={() => {
              setIframeStatus("error");
              if (native) console.log("[KDS Interactive] iframe error:", iframeSrc);
            }}
          />
        </div>
      )}
    </div>
  );
}
