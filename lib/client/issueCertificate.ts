"use client";

import { supabase } from "@/lib/supabaseClient";

type IssueStatus = "CREATED" | "EXISTING";

export type IssueCertificateResult = {
  status: IssueStatus;
  certificate: {
    id: string;
    certificate_no: string;
    issued_at: string;
    score_pct: number | null;
    attempt_id: string | null;
  };
  attemptId: string | null;
};

export type IssueCertificateErrorCode =
  | "NOT_AUTHENTICATED"
  | "MISSING_FULL_NAME"
  | "ATTEMPT_FAILED"
  | "CERT_FAILED";

export class IssueCertificateError extends Error {
  code: IssueCertificateErrorCode;
  constructor(code: IssueCertificateErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

// Client-safe certificate number generator (PV-YYYYMMDD-XXXXXX)
function generateCertificateNumberClient(date: Date = new Date()) {
  const stamp = date.toISOString().slice(0, 10).replace(/-/g, "");
  let hex = "";
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(3);
    crypto.getRandomValues(bytes);
    hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  } else {
    hex = Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, "0")
      .toUpperCase();
  }
  return `PV-${stamp}-${hex}`;
}

type IssueArgs = {
  courseId: string;
  examId: string;
  score: number;
  total: number;
  correctCount: number;
  autoSubmit?: boolean;
};

export async function issueCertificateForCourse(args: IssueArgs): Promise<IssueCertificateResult> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) {
    throw new IssueCertificateError("NOT_AUTHENTICATED", "User not signed in");
  }

  // Ensure display name set
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const fullName = (profile?.full_name ?? "").trim();
  if (profileErr || !fullName) {
    throw new IssueCertificateError("MISSING_FULL_NAME", "Add your full name on the Dashboard before issuing a certificate.");
  }

  // Insert attempt
  const { data: attempt, error: attemptErr } = await supabase
    .from("attempts")
    .insert({
      user_id: user.id,
      exam_id: args.examId,
      score: Math.round(args.score),
      passed: true,
      created_at: new Date().toISOString(),
      meta: {
        autoSubmit: !!args.autoSubmit,
        total: args.total,
        correctCount: args.correctCount,
      },
    })
    .select("id,score,passed,created_at")
    .single();

  if (attemptErr || !attempt) {
    throw new IssueCertificateError("ATTEMPT_FAILED", attemptErr?.message || "Could not record attempt");
  }

  // Existing certificate?
  const { data: existing } = await supabase
    .from("certificates")
    .select("id,certificate_no,issued_at,score_pct,attempt_id")
    .eq("user_id", user.id)
    .eq("course_id", args.courseId)
    .maybeSingle();

  if (existing) {
    return { certificate: existing, status: "EXISTING", attemptId: attempt.id };
  }

  const certificate_no = generateCertificateNumberClient();
  const { data: cert, error: certErr } = await supabase
    .from("certificates")
    .insert({
      user_id: user.id,
      course_id: args.courseId,
      attempt_id: attempt.id,
      score_pct: Math.round(args.score),
      certificate_no,
      issued_at: new Date().toISOString(),
    })
    .select("id,certificate_no,issued_at,score_pct,attempt_id")
    .single();

  if (certErr || !cert) {
    throw new IssueCertificateError("CERT_FAILED", certErr?.message || "Could not issue certificate");
  }

  return { certificate: cert, status: "CREATED", attemptId: attempt.id };
}
