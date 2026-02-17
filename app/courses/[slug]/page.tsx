// File: app/courses/[slug]/page.tsx
// app/courses/[slug]/page.tsx
// Debug note: isEnrolled on this page now mirrors Programs list/Dashboard by checking enrollments
// via user_id + course_id (no slug join). Any enrollment row counts as access (same as elsewhere).
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import NoInternet from "@/components/NoInternet";
import { supabase } from "@/lib/supabaseClient";
import { isNativeApp } from "@/lib/nativePlatform";

type Course = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  img: string | null;
  price: number | null;
  cpd_points: number | null;
  published: boolean | null;
  coming_soon?: boolean | null;
  free_for_logged_in?: boolean | null;
};
const normalizeCourse = (c: any): Course => ({
  ...c,
  coming_soon: c?.coming_soon ?? false,
  free_for_logged_in: c?.free_for_logged_in === true,
});
const isMissingColumn = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: string }).code === "42703";

export default function CoursePreviewPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [native, setNative] = useState(false);

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolled, setEnrolled] = useState<boolean>(false);
  const [hasUser, setHasUser] = useState<boolean>(false);
  const [userChecked, setUserChecked] = useState(false);

  useEffect(() => {
    try {
      setNative(isNativeApp());
    } catch {
      setNative(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug) return;
      try {
        const withFree = await supabase
          .from("courses")
          .select(
            "id,slug,title,description,img,price,cpd_points,published,coming_soon,free_for_logged_in"
          )
          .eq("slug", slug)
          .maybeSingle<Course>();
        let data = withFree.data;
        let error: unknown = withFree.error;

        if (error && isMissingColumn(error)) {
          const fallback = await supabase
            .from("courses")
            .select("id,slug,title,description,img,price,cpd_points,published,coming_soon")
            .eq("slug", slug)
            .maybeSingle<Course>();
          data = fallback.data
            ? ({ ...fallback.data, free_for_logged_in: false } as Course)
            : null;
          error = fallback.error;
        }
        if (cancelled) return;
        if (error || !data || data.published !== true) {
          setCourse(null);
        } else {
          setCourse(normalizeCourse(data));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  // Check enrollment (client-side) for native viewer mode
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug || !course?.id) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setHasUser(false);
        setEnrolled(false);
        setUserChecked(true);
        return;
      }
      setHasUser(true);
      if (course.free_for_logged_in === true) {
        setEnrolled(true);
        setUserChecked(true);
        return;
      }
      const { data, error } = await supabase
        .from("enrollments")
        .select("course_id")
        .eq("user_id", user.id)
        .eq("course_id", course.id)
        .maybeSingle();
      if (cancelled) return;
      const enrollment = data;
      const isEnrolled = !error && !!data; // matches Programs list & Dashboard (any row = enrolled)
      if (process.env.NODE_ENV !== "production" && native) {
        console.log("[PROGRAM DETAIL DEBUG]", {
          isNative: native,
          slug,
          courseId: course?.id,
          userId: user?.id,
          enrollment,
          isEnrolled,
          error,
        });
      }
      setEnrolled(isEnrolled);
      setUserChecked(true);
    })();
    return () => { cancelled = true; };
  }, [slug, course?.id, course?.free_for_logged_in, native]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="h-10 w-40 rounded bg-[color:var(--color-light)]/70 animate-pulse" />
        <div className="mt-4 h-64 rounded-2xl bg-[color:var(--color-light)]/50 animate-pulse" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-xl font-semibold">Not found</h1>
        <p className="text-[var(--color-text-muted)]">This program is unavailable.</p>
      </div>
    );
  }

  const locked = userChecked && !enrolled;
  const hasAccess = userChecked && enrolled;
  const comingSoon = course.coming_soon === true;
  const freeForLoggedIn = course.free_for_logged_in === true;

  return (
    <NoInternet>
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <div className="grid gap-6 md:grid-cols-[1fr_420px]">
          {/* Left */}
          <div className="rounded-2xl bg-white border border-[color:var(--color-light)] overflow-hidden">
            <div className="relative w-full aspect-video bg-[color:var(--color-light)]/40">
              <Image
                src={course.img || "/project-management.png"}
                alt={course.title}
                fill
                sizes="(max-width:768px) 100vw, 60vw"
                className="object-cover"
                priority
              />
            </div>
            <div className="p-5">
              <h1 className="text-2xl font-semibold">{course.title}</h1>
              {comingSoon && (
                <div className="mt-2 inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                  Coming soon
                </div>
              )}
              {freeForLoggedIn && (
                <div className="mt-2 inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  Free for logged-in users
                </div>
              )}
              {course.description && (
                <p className="mt-2 text-[var(--color-text-muted)]">{course.description}</p>
              )}
            </div>
          </div>

          {/* Right */}
          <aside className="rounded-2xl bg-white border border-[color:var(--color-light)] p-5 h-max">
            {!native && (
              <>
                <div className="text-sm text-[var(--color-text-muted)]">Price</div>
                <div className="mt-1 text-2xl font-semibold">
                  GHS {Number(course.price ?? 0).toFixed(2)}
                </div>
              </>
            )}
            <div className="mt-2 text-sm">
              CPPD: <b>{course.cpd_points ?? 0}</b>
            </div>

            {comingSoon ? (
              <div className="mt-5 space-y-2 text-sm text-[color:var(--color-text-muted)]">
                <div className="rounded-lg bg-[color:var(--color-light)]/60 px-4 py-3 font-semibold text-[color:var(--color-text-dark)]">
                  Coming soon – enrollment not available
                </div>
                <div className="text-xs">
                  This program will be available soon. Check back later for enrollment.
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-3 text-sm text-muted">
                {!userChecked && (
                  <div className="rounded-lg bg-[color:var(--color-light)]/60 p-3">
                    Checking your access…
                  </div>
                )}
                {locked && userChecked && (
                  <>
                    <div className="rounded-lg bg-[color:var(--color-light)]/60 p-3">
                      {!hasUser ? (
                        "Sign in to view linked programs."
                      ) : (
                        <>
                          This program is not linked to this account in the
                          companion app. Manage enrollments on the web portal at{" "}
                          <span className="font-semibold">www.panavestkds.com</span>.
                        </>
                      )}
                    </div>
                    {!hasUser ? (
                      <Link
                        href={`/auth/sign-in?redirect=${encodeURIComponent(`/courses/${course.slug}`)}`}
                        className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 ring-1 ring-[color:var(--color-light)] hover:bg-[color:var(--color-light)]/50"
                      >
                        Sign in
                      </Link>
                    ) : (
                      <Link
                        href="/courses"
                        className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 ring-1 ring-[color:var(--color-light)] hover:bg-[color:var(--color-light)]/50"
                      >
                        Back to Programs
                      </Link>
                    )}
                  </>
                )}
                {hasAccess && (
                  <>
                    <div className="rounded-lg bg-[color:var(--color-light)]/60 p-3 text-[color:var(--color-text-muted)]">
                      This companion app shows programs already linked to your PanAvest KDS account.
                    </div>
                    <Link
                      href={`/courses/${course.slug}/dashboard`}
                      className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 ring-1 ring-[color:var(--color-light)] hover:bg-[color:var(--color-light)]/50"
                    >
                      Open program
                    </Link>
                  </>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </NoInternet>
  );
}
