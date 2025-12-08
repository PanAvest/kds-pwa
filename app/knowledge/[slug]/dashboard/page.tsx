// Behaviour: Interactive knowledge dashboard per main app. Fetches course by slug to read interactive_path (or mapped
// fallback) and builds an HTTPS URL (never capacitor://). Shows debug URL. Manual test: open a mapped slug and confirm
// the iframe loads /interactive/<key>/index.html (or the stored interactive_path) and debug text shows the URL.
// DEBUG NOTE: This dashboard now logs and displays interactive_path, interactiveSrc, and any Supabase error in dev,
// so we can see why interactive courses fail in the PWA/native shell.
// TEMP: interactive dashboard debug is always on in the native shell (isNativeApp())
// to diagnose interactive iframe issues when loading from the production PWA URL.
// DEBUG: interactive iframe debug is handled by InteractiveDashboardClient
// (client component) to surface URL + load/error state inside the native shell.

import { createServerClient } from "@/lib/supabaseServer";
import { InteractiveDashboardClient } from "../InteractiveDashboardClient";

type Params = { slug: string };
type Course = { id: string; title: string | null; interactive_path: string | null; delivery_mode: string | null };

export default async function KnowledgeDashboardPage({ params }: { params: Params }) {
  const slug = params?.slug;

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("courses")
    .select("id,title,interactive_path,delivery_mode")
    .eq("slug", slug)
    .maybeSingle();

  const course: Course | null = data
    ? {
        id: data.id,
        title: data.title ?? null,
        interactive_path: data.interactive_path ?? null,
        delivery_mode: data.delivery_mode ?? null,
      }
    : null;

  if (!slug) {
    return (
      <main className="mx-auto max-w-screen-md px-4 py-8">
        <p className="text-sm text-muted">Missing course slug.</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-screen-md px-4 py-8">
        <p className="text-sm text-red-700">Error loading course: {error.message}</p>
      </main>
    );
  }

  if (!course) {
    return (
      <main className="mx-auto max-w-screen-md px-4 py-8">
        <p className="text-sm text-red-700">Course not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-screen-md px-4 py-6">
      <h1 className="text-xl font-bold">Interactive course</h1>
      <p className="text-sm text-muted">Knowledge dashboard interactive player.</p>

      <InteractiveDashboardClient slug={slug} course={course} />
    </main>
  );
}
