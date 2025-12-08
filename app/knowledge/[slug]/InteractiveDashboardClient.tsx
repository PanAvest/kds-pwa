"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/nativePlatform";

function normalizeInteractivePath(
  path: string | null | undefined
): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  let normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  if (!normalizedPath.includes(".html")) {
    if (!normalizedPath.endsWith("/")) {
      normalizedPath = `${normalizedPath}/`;
    }
    normalizedPath = `${normalizedPath}story_html5.html`;
  }

  const origin =
    process.env.NEXT_PUBLIC_MAIN_SITE_ORIGIN?.replace(/\/+$/, "") ||
    "https://www.panavestkds.com";

  return `${origin}${normalizedPath}`;
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
  const interactiveUrl = normalizeInteractivePath(interactivePath);
  const [iframeStatus, setIframeStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");

  if (process.env.NODE_ENV !== "production") {
    console.log("DEBUG interactive iframe URL:", interactiveUrl, {
      slug,
      deliveryMode,
      interactivePath,
      isNative: isNativeApp(),
    });
  }

  useEffect(() => {
    if (interactiveUrl) {
      setIframeStatus("loading");
    } else {
      setIframeStatus("idle");
    }
  }, [interactiveUrl]);

  useEffect(() => {
    if (!isNativeApp()) return;

    console.log("[KDS PWA interactive debug]", {
      slug,
      delivery_mode: deliveryMode,
      interactive_path: interactivePath,
      interactiveUrl,
      isNative: isNativeApp(),
    });
  }, [slug, deliveryMode, interactivePath, interactiveUrl]);

  return (
    <div className="mt-3">
      {isNativeApp() && (
        <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full bg-black/80 px-3 py-1 text-[11px] text-green-200">
          <span className="font-semibold">[DEBUG]</span>
          <span>iframeStatus: {iframeStatus}</span>
          <span className="ml-2 truncate">
            src: <code>{interactiveUrl || "null"}</code>
          </span>
        </div>
      )}

      {deliveryMode !== "interactive" ? (
        <div className="rounded-xl border border-[color:var(--color-light)] bg-white px-4 py-3 text-sm">
          This knowledge module is not marked as interactive.
        </div>
      ) : !interactiveUrl ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          This interactive program is not yet configured. Please contact
          support.
        </div>
      ) : (
        <div className="w-full rounded-2xl bg-white border border-light p-4">
          <iframe
            src={interactiveUrl}
            title={title ?? "Interactive knowledge"}
            className="w-full"
            style={{ border: "none", minHeight: "70vh" }}
            referrerPolicy="no-referrer"
            sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-downloads"
            allow="fullscreen; autoplay"
            allowFullScreen
            onLoad={() => {
              setIframeStatus("loaded");
              if (isNativeApp()) {
                console.log("[KDS PWA interactive iframe] onLoad", {
                  slug,
                  interactiveUrl,
                });
              }
            }}
            onError={() => {
              setIframeStatus("error");
              if (isNativeApp()) {
                console.log("[KDS PWA interactive iframe] onError", {
                  slug,
                  interactiveUrl,
                });
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
