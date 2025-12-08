// Behaviour: Interactive knowledge dashboard per main app. Fetches course by slug to read interactive_path (or mapped
// fallback) and builds an HTTPS URL (never capacitor://). Shows debug URL. Manual test: open a mapped slug and confirm
// the iframe loads /interactive/<key>/index.html (or the stored interactive_path) and debug text shows the URL.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Params = { slug: string };
type Course = { interactive_path: string | null; delivery_mode?: string | null };

function buildInteractiveSrc(course: Course | null | undefined): string | null {
  const raw = course?.interactive_path?.trim();
  if (!raw) return null;

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }

  const origin =
    (process.env.NEXT_PUBLIC_MAIN_SITE_ORIGIN || "https://panavestkds.com").replace(/\/+$/, "");
  const path = raw.startsWith("/") ? raw : `/${raw}`;

  return `${origin}${path}`;
}

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
  const [course, setCourse] = useState<Course | null>(null);

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
          // delivery_mode is assumed interactive on this page; keep query unchanged per requirements
          setCourse({ interactive_path: data.interactive_path ?? null, delivery_mode: "interactive" });
        } else setCourse(null);
      } catch {
        setCourse(null);
      }
    })();
  }, [slug]);

  const interactiveUrl = useMemo(() => buildInteractiveSrc(course), [course]);

  if (process.env.NODE_ENV !== "production" && interactiveUrl) {
    console.log("[KDS PWA interactive src]", interactiveUrl);
  }

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

      {course?.delivery_mode === "interactive" && interactiveUrl ? (
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
