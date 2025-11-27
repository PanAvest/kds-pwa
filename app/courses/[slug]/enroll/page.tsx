// /app/courses/[slug]/enroll/page.tsx
"use client";

import React from "react";
import { Browser } from "@capacitor/browser";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { isNative } from "@/lib/nativeDownload";
import {
  pollPaystackReference,
  PAYSTACK_NATIVE_EVENT,
  PaystackVerifyResponse,
} from "@/lib/paystackNative";

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
  const handledNativeReferences = React.useRef<Set<string>>(new Set());
  const handleNativePaystack = React.useCallback(
    (payload: PaystackVerifyResponse) => {
      if (!payload?.ok) return;
      const reference = payload.reference;
      if (!reference || handledNativeReferences.current.has(reference)) {
        return;
      }
      handledNativeReferences.current.add(reference);
      if (payload.kind === "course" && payload.slug === slug) {
        setNotice("Payment verified. Redirecting…");
        router.replace(`/courses/${slug}/dashboard`);
      }
    },
    [router, slug]
  );

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

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const listener = (event: Event) => {
      const payload = (event as CustomEvent<PaystackVerifyResponse>)?.detail;
      if (!payload) return;
      handleNativePaystack(payload);
    };
    window.addEventListener(PAYSTACK_NATIVE_EVENT, listener as EventListener);
    return () => window.removeEventListener(PAYSTACK_NATIVE_EVENT, listener as EventListener);
  }, [handleNativePaystack]);



  if (!course) {
    return (
      <div className="mx-auto max-w-screen-md px-4 py-10">
        {notice || "Loading…"}
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
        <div className="text-lg font-semibold">
          Total: {course.currency} {(course.price_cents / 100).toFixed(2)}
        </div>
        <div>
          <p className="text-sm text-muted">
            In-app payments are coming soon. For now, payments can only be made on our website.
          </p>
          <a
            href="https://www.panavestkds.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block rounded-lg px-4 py-2 text-white"
            style={{ backgroundColor: "#b65437" }}
          >
            Enroll on website
          </a>
        </div>
        {!!notice && <div className="mt-3 text-sm">{notice}</div>}
      </div>
    </div>
  );
}
