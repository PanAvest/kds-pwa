// Behaviour: Interactive knowledge dashboard per main app. Fetches course by slug to read interactive_path (or mapped
// fallback) and builds an HTTPS URL (never capacitor://). Shows debug URL. Manual test: open a mapped slug and confirm
// the iframe loads /interactive/<key>/index.html (or the stored interactive_path) and debug text shows the URL.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Params = { slug: string };

const MAIN_SITE_ORIGIN =
  process.env.NEXT_PUBLIC_MAIN_SITE_ORIGIN ?? "https://panavestkds.com";

function InteractivePlayer({ src, title = "Interactive course" }: { src: string; title?: string }) {
  return (
    <div className="mt-4">
      <div className="aspect-[16/9] w-full overflow-hidden rounded-xl border border-light bg-black">
        <iframe
          src={src}
          title={title}
          className="h-full w-full border-0"
          allowFullScreen
        />
      </div>
    </div>
  );
}

export default function KnowledgeDashboardPage() {
  const { slug } = useParams<Params>();
  const [course, setCourse] = useState<{ interactive_path: string | null } | null>(null);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("courses")
          .select("interactive_path")
          .eq("slug", slug)
          .maybeSingle();
        if (!error && data) {
          setCourse({ interactive_path: data.interactive_path ?? null });
        } else setCourse(null);
      } catch {
        setCourse(null);
      }
    })();
  }, [slug]);

  const interactiveUrl = useMemo(() => {
    if (!course?.interactive_path) return null;

    const raw = course.interactive_path.trim();

    // If Supabase already stores a full URL, just use it.
    if (/^https?:\/\//i.test(raw)) {
      return raw;
    }

    // Otherwise treat it as the same relative path the main site uses,
    // e.g. "/interactive/ghie-business-ethics" or "/interactive/ghie-business-ethics/index.html"
    const normalizedPath = raw.startsWith("/") ? raw : `/${raw}`;

    // Ensure we end on an html file – if it doesn't already end with .html, append /index.html
    const withIndex = normalizedPath.endsWith(".html")
      ? normalizedPath
      : `${normalizedPath.replace(/\/+$/, "")}/index.html`;

    return `${MAIN_SITE_ORIGIN}${withIndex}`;
  }, [course?.interactive_path]);

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
          <div className="mt-3 w-full rounded-xl overflow-hidden border border-light bg-black">
                    <iframe
                      src={interactiveUrl}
                      title="Interactive course player"
                      className="w-full h-[70vh] bg-black"
                      allowFullScreen
                    />
                  </div>
          <div className="text-xs text-muted">
            If it does not load,{" "}
            <a className="underline" href={interactiveUrl} target="_blank" rel="noreferrer">
              open in a new tab
            </a>.
          </div>
          <p className="mt-1 text-[10px] text-gray-500 break-all">
            Current interactive URL: <span className="font-mono">{interactiveUrl}</span>
          </p>
        </>
      ) : (
        <div className="text-sm text-red-700">
          Interactive entry path is not configured for this course.
        </div>
      )}
    </main>
  );
}
