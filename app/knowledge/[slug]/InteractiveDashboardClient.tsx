"use client";

import { useEffect, useMemo, useState } from "react";
import { isNativeApp } from "@/lib/nativePlatform";

const MAIN_ORIGIN =
  (process.env.NEXT_PUBLIC_MAIN_SITE_ORIGIN || "https://panavestkds.com").replace(
    /\/+$/,
    ""
  );

function buildInteractivePaths(raw: string | null | undefined) {
  if (!raw) return { relative: null as string | null, absolute: null as string | null };

  let trimmed = raw.trim();
  if (!trimmed) return { relative: null, absolute: null };

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
  const [iframeStatus, setIframeStatus] = useState<"idle" | "loading" | "loaded" | "error">(
    "idle"
  );

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
      {/* Native debug badge so we can see exactly what src is being used */}
      {native && (
        <div className="mb-3 inline-flex max-w-full flex-col gap-1 rounded-xl bg-black/80 px-3 py-2 text-[10px] text-green-200">
          <div className="flex items-center gap-2">
            <span className="font-semibold">[INTERACTIVE DEBUG]</span>
            <span>status: {iframeStatus}</span>
          </div>
          <div className="truncate">
            interactivePath: <code>{interactivePath || "null"}</code>
          </div>
          <div className="truncate">
            relative: <code>{relative || "null"}</code>
          </div>
          <div className="truncate">
            iframeSrc: <code>{iframeSrc || "null"}</code>
          </div>
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
            style={{ border: "none", minHeight: "70vh" }}
            referrerPolicy="no-referrer"
            sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-downloads"
            allow="fullscreen; autoplay"
            allowFullScreen
            onLoad={() => {
              setIframeStatus("loaded");
              if (native) {
                console.log("[KDS PWA interactive iframe] onLoad", {
                  slug,
                  iframeSrc,
                });
              }
            }}
            onError={() => {
              setIframeStatus("error");
              if (native) {
                console.log("[KDS PWA interactive iframe] onError", {
                  slug,
                  iframeSrc,
                });
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
