// Behaviour: Interactive knowledge dashboard per main app. Fetches course by slug to read interactive_path (or mapped
// fallback) and builds an HTTPS URL (never capacitor://). Shows debug URL. Manual test: open a mapped slug and confirm
// the iframe loads /interactive/<key>/index.html (or the stored interactive_path) and debug text shows the URL.
// DEBUG NOTE: This dashboard now logs and displays interactive_path, interactiveSrc, and any Supabase error in dev,
// so we can see why interactive courses fail in the PWA/native shell.
// TEMP: interactive dashboard debug is always on in the native shell (isNativeApp())
// to diagnose interactive iframe issues when loading from the production PWA URL.
// DEBUG: interactive iframe now logs interactiveSrc and load/error status
// in the native shell (isNativeApp) to help diagnose PWA interactive issues.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { isNativeApp } from "@/lib/nativePlatform";

type Params = { slug: string };
type Course = { interactive_path: string | null; delivery_mode?: string | null; title?: string | null };

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
  const [supabaseError, setSupabaseError] = useState<string | null>(null);
  const [iframeStatus, setIframeStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("courses")
          .select("interactive_path,delivery_mode")
          .eq("slug", slug)
          .maybeSingle();
        setSupabaseError(error?.message ?? null);
        if (!error && data) {
          setCourse({ interactive_path: data.interactive_path ?? null, delivery_mode: data.delivery_mode ?? null });
        } else {
          setCourse(null);
        }
      } catch {
        setSupabaseError("Unexpected error");
        setCourse(null);
      }
    })();
  }, [slug]);

  const interactiveUrl = useMemo(() => buildInteractiveSrc(course), [course]);

  useEffect(() => {
    if (interactiveUrl) {
      setIframeStatus((prev) => (prev === "loaded" ? "loaded" : "loading"));
    } else {
      setIframeStatus("idle");
    }
  }, [interactiveUrl]);

  if (isNativeApp()) {
    console.log("[KDS PWA interactive debug]", {
      slug,
      supabaseError,
      course,
      delivery_mode: course?.delivery_mode,
      interactive_path: course?.interactive_path,
      interactiveSrc: interactiveUrl,
    });
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

      {isNativeApp() && (
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-black/80 px-3 py-1 text-[11px] text-green-200">
          <span className="font-semibold">[DEBUG]</span>
          <span>iframeStatus: {iframeStatus}</span>
          <span className="ml-2 truncate max-w-[180px]">
            src: <code>{interactiveUrl || "null"}</code>
          </span>
        </div>
      )}

      {isNativeApp() && (
        <div className="m-3 rounded-lg bg-black/80 text-[11px] text-green-200 p-3 space-y-1">
          <div className="font-semibold text-green-300">
            [DEBUG] Interactive Dashboard
          </div>
          <div>Slug: <code className="text-xs">{slug}</code></div>
          <div>Delivery mode: <code className="text-xs">{String(course?.delivery_mode)}</code></div>
          <div>interactive_path: <code className="text-xs break-all">{String(course?.interactive_path)}</code></div>
          <div>interactiveSrc: <code className="text-xs break-all">{String(interactiveUrl)}</code></div>
          {supabaseError && (
            <div className="text-red-300">
              Supabase error: <code className="text-xs">{String((supabaseError as any)?.message ?? supabaseError)}</code>
            </div>
          )}
          {interactiveUrl && (
            <a
              href={interactiveUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-1 rounded bg-green-700 px-2 py-1 text-[10px]"
            >
              Open interactiveSrc
            </a>
          )}
        </div>
      )}

      {course?.delivery_mode === "interactive" && interactiveUrl ? (
        <>
          <div className="mt-3 w-full rounded-xl overflow-hidden border border-light bg-black">
            <iframe
              src={interactiveUrl}
              title={course?.title ?? "Interactive knowledge"}
              className="w-full h-[70vh] bg-black"
              onLoad={() => {
                setIframeStatus("loaded");
                if (isNativeApp()) {
                  console.log("[KDS PWA interactive iframe] onLoad", { interactiveSrc: interactiveUrl, slug });
                }
              }}
              onError={() => {
                setIframeStatus("error");
                if (isNativeApp()) {
                  console.log("[KDS PWA interactive iframe] onError", { interactiveSrc: interactiveUrl, slug });
                }
              }}
              allow="accelerometer; autoplay; encrypted-media; fullscreen; gyroscope; picture-in-picture"
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
