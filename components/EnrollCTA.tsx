// components/EnrollCTA.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { isIOSApp } from "@/lib/platform";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  courseId: string;
  slug: string;
  className?: string;
};

type EnrollState =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "enrolled" }
  | { kind: "not_enrolled" };

export default function EnrollCTA({ courseId, slug, className }: Props) {
  const [state, setState] = useState<EnrollState>({ kind: "loading" });
  const isIOS = useMemo(() => isIOSApp(), []);
  const iosAccessCopy =
    "On iOS, this app lets you sign in and access courses you have already obtained through KDS Learning elsewhere. Purchases are done outside the iOS app.";

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (alive) setState({ kind: "signed_out" });
        return;
      }
      const { data, error } = await supabase
        .from("enrollments")
        .select("user_id, course_id")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .maybeSingle();
      if (!alive) return;
      if (error || !data) setState({ kind: "not_enrolled" });
      else setState({ kind: "enrolled" });
    })();
    return () => { alive = false; };
  }, [courseId]);

  if (state.kind === "loading") {
    return (
      <div className={className}>
        <div className="h-10 rounded-lg bg-[color:var(--color-light)]/60 animate-pulse" />
      </div>
    );
  }

  if (state.kind === "signed_out") {
    if (isIOS) {
      return (
        <div className={`space-y-2 ${className || ""}`}>
          <div className="text-sm text-muted">{iosAccessCopy}</div>
          <Link
            href={`/auth/sign-in?redirect=${encodeURIComponent(`/courses/${slug}`)}`}
            className="inline-flex items-center justify-center rounded-lg bg-[color:var(--color-accent-red)] text-white px-5 py-2.5 font-semibold hover:opacity-90"
          >
            Sign in to access
          </Link>
        </div>
      );
    }
    return (
      <Link
        href={`/auth/sign-in?redirect=${encodeURIComponent(`/courses/${slug}`)}`}
        className={`inline-flex items-center justify-center rounded-lg bg-[color:var(--color-accent-red)] text-white px-5 py-2.5 font-semibold hover:opacity-90 ${className || ""}`}
      >
        Sign in to Enroll
      </Link>
    );
  }

  if (state.kind === "enrolled") {
    return (
      <Link
        href={`/courses/${slug}/dashboard`}
        className={`inline-flex items-center justify-center rounded-lg px-5 py-2.5 ring-1 ring-[color:var(--color-light)] hover:bg-[color:var(--color-light)]/50 ${className || ""}`}
      >
        Go to Dashboard
      </Link>
    );
  }

  if (isIOS) {
    return (
      <div className={`space-y-2 ${className || ""}`}>
        <div className="text-sm text-muted">{iosAccessCopy}</div>
        <div className="text-xs text-muted">
          If you already have access, sign in with the same KDS Learning account to continue.
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/courses/${slug}/enroll`}
      className={`inline-flex items-center justify-center rounded-lg bg-[color:var(--color-accent-red)] text-white px-5 py-2.5 font-semibold hover:opacity-90 ${className || ""}`}
    >
      Enroll
    </Link>
  );
}
