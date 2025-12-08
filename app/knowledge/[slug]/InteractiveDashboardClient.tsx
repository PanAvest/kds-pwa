"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/nativePlatform";

/**
 * Normalize a stored interactive_path into a RELATIVE path like:
 *   /interactive/boardroom/story_html5.html
 * This is used when we want to go through our proxy, which expects a path.
 */
function normalizeInteractiveRelativePath(
  path: string | null | undefined
): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;

  // Full URLs are handled elsewhere
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return null;
  }

  let normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  if (!normalizedPath.includes(".html")) {
    if (!normalizedPath.endsWith("/")) {
      normalizedPath = `${normalizedPath}/`;
    }
    normalizedPath = `${normalizedPath}story_html5.html`;
  }

  return normalizedPath;
}

/**
 * Normalize a stored interactive_path into an ABSOLUTE URL using the
 * canonical origin (NEXT_PUBLIC_MAIN_SITE_ORIGIN or fallback).
 */
function normalizeInteractiveAbsoluteUrl(
  path: string | null | undefined
): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  const rel = normalizeInteractiveRelativePath(trimmed);
  if (!rel) return null;

  const origin =
    process.env.NEXT_PUBLIC_MAIN_SITE_ORIGIN?.replace(/\/+$/, "") ||
    "https://panavestkds.com";

  return `${origin}${rel}`;
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

  useEffect(() => {
    try {
      setNative(isNativeApp());
    } catch {
      setNative(false);
    }
  }, []);

  const relativePath = normalizeInteractiveRelativePath(interactivePath);
  const absoluteUrl = normalizeInteractiveAbsoluteUrl(interactivePath);

  // Use the proxy in the native shell to avoid X-Frame / CORS issues
  const useProxy = native && !!relativePath;

  const frameSrc = useProxy
    ? `/api/interactive/proxy?path=${encodeURIComponent(relativePath!)}`
    : absoluteUrl;

  if (process.env.NODE_ENV !== "production") {
    console.log("DEBUG interactive iframe URL:", {
      slug,
      deliveryMode,
      interactivePath,
      isNative: native,
      relativePath,
      absoluteUrl,
      useProxy,
      frameSrc,
    });
  }

  useEffect(() => {
    if (frameSrc) {
      setIframeStatus("loading");
    } else {
      setIframeStatus("idle");
    }
  }, [frameSrc]);

  useEffect(() => {
    if (!native) return;

    console.log("[KDS PWA interactive debug]", {
      slug,
      delivery_mode: deliveryMode,
      interactive_path: interactivePath,
      relativePath,
      absoluteUrl,
      frameSrc,
      isNative: native,
    });
  }, [slug, deliveryMode, interactivePath, relativePath, absoluteUrl, frameSrc, native]);

  return (
    <div className="mt-3">
      {native && (
        <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full bg-black/80 px-3 py-1 text-[11px] text-green-200">
          <span className="font-semibold">[DEBUG]</span>
          <span>iframeStatus: {iframeStatus}</span>
          <span className="ml-2 truncate">
            src: <code>{frameSrc || "null"}</code>
          </span>
        </div>
      )}

      {deliveryMode !== "interactive" ? (
        <div className="rounded-xl border border-[color:var(--color-light)] bg-white px-4 py-3 text-sm">
          This knowledge module is not marked as interactive.
        </div>
      ) : !frameSrc ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          This interactive program is not yet configured. Please contact support.
        </div>
      ) : (
        <div className="w-full rounded-2xl bg-white border border-light p-4">
          <iframe
            src={frameSrc}
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
                  frameSrc,
                });
              }
            }}
            onError={() => {
              setIframeStatus("error");
              if (native) {
                console.log("[KDS PWA interactive iframe] onError", {
                  slug,
                  frameSrc,
                });
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
