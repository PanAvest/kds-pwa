"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Course = {
  id: string;
  slug: string;
  title: string;
  free_for_logged_in?: boolean | null;
};

export default function EnrollPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user) {
          router.push(
            `/auth/sign-in?redirect=${encodeURIComponent(`/courses/${slug}/enroll`)}`
          );
          return;
        }

        const { data: c, error: cErr } = await supabase
          .from("courses")
          .select("id,slug,title,free_for_logged_in")
          .eq("slug", slug)
          .maybeSingle<Course>();
        if (cancelled) return;
        if (cErr || !c) {
          setNotice("Program not found or unavailable.");
          return;
        }
        setCourse(c);
        if (c.free_for_logged_in === true) {
          router.replace(`/courses/${slug}/dashboard`);
          return;
        }

        const { data: enrollment } = await supabase
          .from("enrollments")
          .select("id")
          .eq("user_id", user.id)
          .eq("course_id", c.id)
          .maybeSingle();
        if (cancelled) return;
        if (enrollment) {
          router.replace(`/courses/${slug}/dashboard`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, slug]);

  if (loading) {
    return <div className="mx-auto max-w-screen-md px-4 py-10">Loading…</div>;
  }

  if (!course) {
    return (
      <div className="mx-auto max-w-screen-md px-4 py-10">
        {notice || "Program unavailable."}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-md px-4 md:px-6 py-10">
      <h1 className="text-2xl font-bold">Program Access: {course.title}</h1>
      <p className="mt-2 text-[color:var(--color-text-muted)]">
        This companion app only opens programs already linked to your account.
      </p>

      <div className="mt-6 rounded-2xl bg-white border border-[color:var(--color-light)] p-5 space-y-3 text-sm text-[color:var(--color-text-muted)]">
        <p>
          Enrollments and payments are managed on{" "}
          <span className="font-semibold">www.panavestkds.com</span>.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/courses"
            className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 ring-1 ring-[color:var(--color-light)] hover:bg-[color:var(--color-light)]/50"
          >
            Back to Programs
          </Link>
          <a
            href="https://www.panavestkds.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 ring-1 ring-[color:var(--color-light)] hover:bg-[color:var(--color-light)]/50"
          >
            Open Website
          </a>
        </div>
      </div>
    </div>
  );
}
