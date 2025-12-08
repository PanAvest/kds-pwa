"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/nativePlatform";

type InteractiveDashboardClientProps = {
  slug: string;
  title: string | null;
  delivery_mode: string | null;
  interactive_path: string | null;
};

export function InteractiveDashboardClient({
  slug,
  title,
  delivery_mode,
  interactive_path,
}: InteractiveDashboardClientProps) {
  const safeSrc = interactive_path
    ? `/api/interactive/proxy?path=${encodeURIComponent(interactive_path)}`
    : null;
  const [iframeStatus, setIframeStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");

  useEffect(() => {
    if (safeSrc) {
      setIframeStatus("loading");
    } else {
      setIframeStatus("idle");
    }
  }, [safeSrc]);

  useEffect(() => {
    if (!isNativeApp()) return;

    console.log("[KDS PWA interactive debug]", {
      slug,
      delivery_mode,
      interactive_path,
      interactiveSrc: safeSrc,
    });
  }, [slug, delivery_mode, interactive_path, safeSrc]);

  return (
    <div className="mt-3">
      {isNativeApp() && (
        <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full bg-black/80 px-3 py-1 text-[11px] text-green-200">
          <span className="font-semibold">[DEBUG]</span>
          <span>iframeStatus: {iframeStatus}</span>
          <span className="ml-2 truncate">
            src: <code>{safeSrc || "null"}</code>
          </span>
        </div>
      )}

      {delivery_mode !== "interactive" ? (
        <div className="rounded-xl border border-[color:var(--color-light)] bg-white px-4 py-3 text-sm">
          This knowledge module is not marked as interactive.
        </div>
      ) : !safeSrc ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Interactive path is missing or invalid for this module.
        </div>
      ) : (
        <div className="w-full rounded-2xl bg-white border border-light p-4">
          <iframe
            src={safeSrc || ""}
            title={title ?? "Interactive knowledge"}
            className="w-full h-[80vh] rounded-lg border"
            referrerPolicy="no-referrer"
            sandbox="allow-forms allow-same-origin allow-scripts allow-popups allow-downloads"
            allow="fullscreen; autoplay; clipboard-write; *"
            onLoad={() => {
              setIframeStatus("loaded");
              if (isNativeApp()) {
                console.log("[KDS PWA interactive iframe] onLoad", {
                  slug,
                  interactiveSrc: safeSrc,
                });
              }
            }}
            onError={() => {
              setIframeStatus("error");
              if (isNativeApp()) {
                console.log("[KDS PWA interactive iframe] onError", {
                  slug,
                  interactiveSrc: safeSrc,
                });
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
