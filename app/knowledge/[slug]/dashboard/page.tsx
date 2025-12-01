// Behaviour: Interactive knowledge dashboard per README-upgrade.md. Maps course slug -> /interactive/<key> under the PWA
// origin and passes the full URL into an interactive player iframe, with a tiny debug helper showing the resolved URL.
// Manual test: open a knowledge course slug (e.g. ghie-business-ethics), confirm the iframe loads
// /interactive/ghie-business-ethics/index.html, and see the debug line with the full URL.
"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";

type Params = { slug: string };

const interactiveMap: Record<string, string> = {
  "ghie-business-ethics": "/interactive/ghie-business-ethics",
};

function InteractivePlayer({ interactiveUrl }: { interactiveUrl: string }) {
  return (
    <div className="mt-4">
      <div className="aspect-[16/9] w-full overflow-hidden rounded-xl border border-light bg-black">
        <iframe
          src={interactiveUrl}
          title="Interactive course"
          className="h-full w-full border-0"
          allowFullScreen
        />
      </div>
    </div>
  );
}

export default function KnowledgeDashboardPage() {
  const { slug } = useParams<Params>();

  const origin =
    typeof window !== "undefined" && window.location ? window.location.origin : "https://kds-pwa.vercel.app";

  const interactiveUrl = useMemo(() => {
    const path = slug && interactiveMap[slug] ? interactiveMap[slug] : null;
    if (!path) return null;
    const normalizedPath = path.endsWith(".html") ? path : `${path}/index.html`;
    return `${origin}${normalizedPath}`;
  }, [origin, slug]);

  if (!slug) {
    return (
      <main className="mx-auto max-w-screen-md px-4 py-8">
        <p className="text-sm text-muted">Missing course slug.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-screen-md px-4 py-6">
      <h1 className="text-xl font-bold">Interactive course</h1>
      <p className="text-sm text-muted">Knowledge dashboard interactive player.</p>

      {interactiveUrl ? (
        <>
          <InteractivePlayer interactiveUrl={interactiveUrl} />
          <p className="mt-2 text-[10px] text-gray-500">
            Current interactive URL: <span className="font-mono break-all">{interactiveUrl}</span>
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted">No interactive content mapped for this course.</p>
      )}
    </main>
  );
}
