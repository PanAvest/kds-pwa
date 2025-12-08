// File: app/courses/[slug]/enroll/page.tsx
// /app/courses/[slug]/enroll/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { isNativeApp } from "@/lib/nativePlatform";
import { supabase } from "@/lib/supabaseClient";

type CourseRow = {
  id: string;
  slug: string;
  title: string;
  // tolerate both schemas
  price_cents?: number | null;
  price?: number | null;
  currency?: string | null;
};

type Course = {
  id: string;
  slug: string;
  title: string;
  price_cents: number; // minor units
  currency: string;
};

export default function EnrollPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const slug = params?.slug ?? "";

  const [userId, setUserId] = React.useState<string>("");
  const [email, setEmail] = React.useState<string>("");
  const [course, setCourse] = React.useState<Course | null>(null);
  const [notice, setNotice] = React.useState<string>("");
  const [enrollmentStatus, setEnrollmentStatus] = React.useState<"unknown" | "enrolled" | "not_enrolled">("unknown");
  const [isNative, setIsNative] = React.useState(false);

  React.useEffect(() => {
    try {
      setIsNative(isNativeApp());
    } catch {
      setIsNative(false);
    }
  }, []);

  // Require auth
  React.useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push(`/auth/sign-in?redirect=${encodeURIComponent(`/courses/${slug}/enroll`)}`);
        return;
      }
      setUserId(user.id);
      setEmail(user.email ?? "");
    })();
  }, [router, slug]);

  // Load course (tolerate price or price_cents)
  React.useEffect(() => {
    if (!slug) return;
    (async () => {
      // Select both names; DB returns the ones that exist
      const { data, error } = await supabase
        .from("courses")
        .select("id,slug,title,price_cents,price,currency")
        .eq("slug", slug)
        .maybeSingle<CourseRow>();

      if (error || !data) {
        // Log more detail in devtools to debug 400s quickly
        console.debug("courses query error", error);
        setNotice("Course not found or temporarily unavailable.");
        return;
      }

      const minor =
        typeof data.price_cents === "number"
          ? Math.max(0, Math.floor(Number(data.price_cents)))
          : Math.max(0, Math.round(Number(data.price ?? 0) * 100));

      setCourse({
        id: data.id,
        slug: data.slug,
        title: data.title,
        price_cents: minor,
        currency: (data.currency ?? "GHS").toUpperCase(),
      });
    })();
  }, [slug, router]);

  // Check enrollment and redirect to dashboard if already enrolled
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId || !course?.id) return;
      const { data, error } = await supabase
        .from("enrollments")
        .select("id")
        .eq("user_id", userId)
        .eq("course_id", course.id)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data) {
        setEnrollmentStatus("enrolled");
        router.replace(`/courses/${slug}/dashboard`);
      } else {
        setEnrollmentStatus("not_enrolled");
      }
    })();
    return () => { cancelled = true; };
  }, [userId, course?.id, router, slug]);

  // Verify return from Paystack (?verify=1&reference=…)
  React.useEffect(() => {
    const ref = search.get("reference") || search.get("trxref");
    const shouldVerify = search.get("verify") === "1" && !!ref;
    if (!shouldVerify) return;

    (async () => {
      try {
        const res = await fetch(`/api/payments/paystack/verify?reference=${encodeURIComponent(ref!)}`, { cache: "no-store" });
        const j = await res.json();
        if (j?.ok) {
          setNotice("Payment verified. Redirecting…");
          router.replace(`/courses/${slug}/dashboard`);
        } else {
          setNotice(j?.error || j?.message || "Could not verify payment yet. If charged, webhook will sync soon.");
        }
      } catch {
        setNotice("Verification failed. If charged, it will auto-resolve via webhook shortly.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function payNow() {
    if (isNative) {
      setNotice("This mobile app is for accessing materials already on your KDS Learning account. New items are added via the KDS Learning website.");
      return;
    }
    if (!userId || !email || !course) return;
    try {
      setNotice("Redirecting to Paystack…");
      const res = await fetch("/api/payments/paystack/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          amountMinor: course.price_cents, // already minor units
          meta: { kind: "course", user_id: userId, course_id: course.id, slug: course.slug },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.authorization_url) {
        setNotice(data?.error || "Failed to initialize payment.");
        return;
      }
      // Move in the same window so Safari/standalone apps don’t spawn a new tab
      window.location.replace(data.authorization_url as string);
    } catch {
      setNotice("Something went wrong starting the payment. Please try again.");
    }
  }

  if (!course) {
    return (
      <div className="mx-auto max-w-screen-md px-4 py-10">
        {notice || "Loading…"}
      </div>
    );
  }

  if (enrollmentStatus === "enrolled") {
    return (
      <div className="mx-auto max-w-screen-md px-4 py-10 space-y-3">
        <h1 className="text-2xl font-bold">You already have access</h1>
        <p className="text-[color:var(--color-text-muted)]">
          Redirecting you to the course dashboard…
        </p>
        <button
          type="button"
          onClick={() => router.replace(`/courses/${slug}/dashboard`)}
          className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 ring-1 ring-[color:var(--color-light)] hover:bg-[color:var(--color-light)]/50"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-md px-4 md:px-6 py-10">
      <h1 className="text-2xl font-bold">Enroll: {course.title}</h1>
      <p className="mt-2 text-[color:var(--color-text-muted)]">
        Pay once to unlock this course with your account.
      </p>

      <div className="mt-6 rounded-2xl bg-white border border-[color:var(--color-light)] p-5">
        {isNative ? (
          <div className="space-y-2 text-sm text-muted">
            <div className="text-base font-semibold text-ink">Mobile viewer notice</div>
            <p>
              Enrollments for PanAvest KDS programs are handled on the web portal at www.panavestkds.com. This mobile app is for viewing programs already on your account.
            </p>
            <Link
              href="/courses"
              className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 ring-1 ring-[color:var(--color-light)] hover:bg-[color:var(--color-light)]/50"
            >
              Back to Programs
            </Link>
          </div>
        ) : (
          <>
            <div className="text-lg font-semibold">
              Total: {course.currency} {(course.price_cents / 100).toFixed(2)}
            </div>
            <button
              type="button"
              onClick={payNow}
              className="mt-4 rounded-lg bg-[color:#b65437] text-white px-5 py-2 font-semibold hover:opacity-90"
            >
              Pay with Paystack
            </button>
          </>
        )}
        {!!notice && <div className="mt-3 text-sm">{notice}</div>}
      </div>
    </div>
  );
}
