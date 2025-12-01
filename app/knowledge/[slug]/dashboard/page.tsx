// Behaviour: Interactive knowledge dashboard per main app. Fetches course by slug to read interactive_path (or mapped
// fallback) and builds an HTTPS URL (never capacitor://). Shows debug URL. Manual test: open a mapped slug and confirm
// the iframe loads /interactive/<key>/index.html (or the stored interactive_path) and debug text shows the URL.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Params = { slug: string };

const INTERACTIVE_MAP: Record<string, string> = {
  "ghie-business-ethics": "/interactive/ghie-business-ethics",
  // add more mappings if interactive_path is not set in DB
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
  const [interactivePath, setInteractivePath] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("courses")
          .select("interactive_path")
          .eq("slug", slug)
          .maybeSingle();
        if (!error && data?.interactive_path) {
          setInteractivePath(data.interactive_path);
        } else {
          setInteractivePath(null);
        }
      } catch {
        setInteractivePath(null);
      }
    })();
  }, [slug]);

  const origin =
    process.env.NEXT_PUBLIC_MAIN_SITE_ORIGIN ||
    process.env.NEXT_PUBLIC_PUBLIC_WEB_BASE_URL ||
    (typeof window !== "undefined" && window.location ? window.location.origin : "https://kdslearning.com");

  const interactiveUrl = useMemo(() => {
    const mapped = slug && INTERACTIVE_MAP[slug] ? INTERACTIVE_MAP[slug] : null;
    const path = interactivePath || mapped;
    if (!path) return null;
    const isHttp = /^https?:\/\//i.test(path);
    const normalizedPath = path.endsWith(".html") ? path : `${path}/index.html`;
    return isHttp ? normalizedPath : `${origin}${normalizedPath}`;
  }, [origin, slug, interactivePath]);

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
