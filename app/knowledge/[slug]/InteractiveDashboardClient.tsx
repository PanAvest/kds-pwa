"use client";

import { useEffect, useMemo, useState } from "react";

const MAIN_ORIGIN = (
  process.env.NEXT_PUBLIC_MAIN_SITE_ORIGIN || "https://panavestkds.com"
).replace(/\/+$/, "");
const INTERACTIVE_PROXY_VERSION = "20260217-2";

function buildInteractivePaths(raw: string | null | undefined) {
  if (!raw) {
    return { relative: null as string | null, absolute: null as string | null };
  }

  let trimmed = raw.trim();
  if (!trimmed) {
    return { relative: null, absolute: null };
  }

  // If admin stored a full URL, keep it.
  if (/^https?:\/\//i.test(trimmed)) {
    return { relative: trimmed, absolute: trimmed };
  }

  // Treat as a relative path from the main site root.
  if (!trimmed.startsWith("/")) {
    trimmed = `/${trimmed}`;
  }

  // If a folder was provided, default to Storyline's main HTML entry.
  if (!/\.html?$/i.test(trimmed)) {
    if (!trimmed.endsWith("/")) trimmed += "/";
    trimmed += "story_html5.html";
  }

  return {
    relative: trimmed,
    absolute: `${MAIN_ORIGIN}${trimmed}`,
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
  const [iframeStatus, setIframeStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");

  const { relative, absolute } = useMemo(
    () => buildInteractivePaths(interactivePath),
    [interactivePath]
  );

  // Always route through app proxy so web/native use the same stable load path.
  const iframeSrc = useMemo(() => {
    const target = relative || absolute;
    if (!target) return null;
    const q = encodeURIComponent(target);
    const v = encodeURIComponent(INTERACTIVE_PROXY_VERSION);
    return `/api/interactive/proxy?path=${q}&v=${v}`;
  }, [relative, absolute]);

  useEffect(() => {
    setIframeStatus(iframeSrc ? "loading" : "idle");
  }, [iframeSrc]);

  return (
    <div className="mt-3">
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
            key={`${slug}:${iframeSrc}`}
            src={iframeSrc}
            title={title ?? "Interactive knowledge"}
            className="w-full"
            style={{ border: "none", minHeight: "70vh" }}
            sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-downloads"
            allow="fullscreen; autoplay"
            allowFullScreen
            onLoad={() => setIframeStatus("loaded")}
            onError={() => setIframeStatus("error")}
          />

          {iframeStatus === "error" && absolute && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              The interactive module failed to load in-app.
              <a
                href={absolute}
                target="_blank"
                rel="noreferrer"
                className="ml-1 underline"
              >
                Open directly
              </a>
              .
            </div>
          )}
        </div>
      )}
    </div>
  );
}
