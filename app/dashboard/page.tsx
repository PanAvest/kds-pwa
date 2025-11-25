"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { ProgressBar } from "@/components/ProgressBar";
import SimpleCertificate from "@/components/SimpleCertificate";

/* Types */
type CourseRow = { id: string; slug: string; title: string; img: string | null; cpd_points: number | null };
type EnrollmentRow = { course_id: string; progress_pct: number | null; courses?: CourseRow | CourseRow[] | null };
type EnrolledCourse = { course_id: string; progress_pct: number; title: string; slug: string; img: string | null; cpd_points: number | null };

type EbookRow = { id: string; slug: string; title: string; cover_url: string | null; price_cents: number };
type PurchaseRow = { ebook_id: string; status: string | null; ebooks?: EbookRow | EbookRow[] | null };
type PurchasedEbook = { ebook_id: string; slug: string; title: string; cover_url: string | null; price_cedis: string };

type QuizAttempt = { course_id: string; chapter_id: string; total_count: number; correct_count: number; score_pct: number; completed_at: string };
type ChapterInfo = { id: string; title: string; order_index: number; course_id: string };

type ProfileRow = { id: string; full_name: string | null; updated_at?: string | null };

type CourseMeta = { title: string; slug: string; cpd_points?: number | null; img?: string | null };
type CertificateRow = {
  id: string;
  user_id: string;
  course_id: string;
  attempt_id: string | null;
  score_pct: number | null;
  certificate_no: string;
  issued_at: string;
  courses: { title: string; slug: string; img: string | null; cpd_points?: number | null } | null;
};
type ExamRow = { id: string; course_id: string; title: string | null; pass_mark: number | null };
type AttemptRow = { id: string; user_id: string; exam_id: string; score: number | null; passed: boolean | null; created_at: string };

function pickCourse(c: CourseRow | CourseRow[] | null | undefined): CourseRow | null {
  if (!c) return null;
  return Array.isArray(c) ? (c[0] ?? null) : c;
}
function pickEbook(e: EbookRow | EbookRow[] | null | undefined): EbookRow | null {
  if (!e) return null;
  return Array.isArray(e) ? (e[0] ?? null) : e;
}

const PANABLUE = "#0a1156";

/* Simple section wrapper */
function Section({ title, children, anchor }: { title: string; children: React.ReactNode; anchor?: string }) {
  return (
    <section id={anchor} className="mt-6">
      <h2 className="px-4 text-base font-semibold tracking-tight">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/* Sticky app-like header */
function AppHeader({ name, onEdit }: { name: string; onEdit: () => void }) {
  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-[color:var(--color-light)]">
      <div className="mx-auto max-w-screen-md px-4 h-[56px] flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[10px] text-muted -mb-0.5">Dashboard</div>
          <h1 className="text-lg font-bold truncate">{name ? `Welcome, ${name}` : "Welcome"}</h1>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded-lg border px-3 py-1.5 text-xs"
          title="Your certificate uses this name"
        >
          {name ? "Edit name" : "Add name"}
        </button>
      </div>
    </header>
  );
}

export default function DashboardPage() {
  const router = useRouter();

  // Auth
  const [sessionReady, setSessionReady] = useState(false);
  const [userId, setUserId] = useState("");

  // Profile
  const [fullName, setFullName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // Data
  const [loading, setLoading] = useState(true);
  const [ebooks, setEbooks] = useState<PurchasedEbook[]>([]);
  const [enrolled, setEnrolled] = useState<EnrolledCourse[]>([]);
  const [quiz, setQuiz] = useState<QuizAttempt[]>([]);
  const [chaptersById, setChaptersById] = useState<Record<string, ChapterInfo>>({});
  const [courseMetaMap, setCourseMetaMap] = useState<Record<string, CourseMeta>>({});
  const [certs, setCerts] = useState<CertificateRow[]>([]);
  const [provisionalCerts, setProvisionalCerts] = useState<
    { course_id: string; course_title: string; course_slug: string; img: string | null; cpd_points: number | null; score_pct: number; passed_at: string }[]
  >([]);
  const [downloadingCertId, setDownloadingCertId] = useState<string | null>(null);

  /* Auth gate */
  useEffect(() => {
    let cancelled = false;
    const goSignIn = () => router.replace("/auth/sign-in?next=/dashboard");

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session?.user?.id) {
          setUserId(data.session.user.id);
          setSessionReady(true);
        } else {
          goSignIn();
        }
      } catch {
        goSignIn();
      }
    })();

    const sub = supabase.auth.onAuthStateChange((_evt, session) => {
      if (cancelled) return;
      if (session?.user?.id) {
        setUserId(session.user.id);
        setSessionReady(true);
      } else {
        goSignIn();
      }
    });

    return () => {
      cancelled = true;
      sub.data.subscription.unsubscribe();
    };
  }, [router]);

  /* Load data */
  useEffect(() => {
    if (!sessionReady || !userId) return;
    const ac = new AbortController();
    const { signal } = ac;
    let alive = true;

    (async () => {
      setLoading(true);

      const guard = () => !(signal.aborted || !alive);
      const safeSelect = async <T,>(label: string, fn: () => Promise<{ data: T | null; error: unknown }>): Promise<T> => {
        try {
          const { data, error } = await fn();
          if (error) {
            console.warn(`${label} fetch error`, error);
          }
          return (data as T) ?? ([] as unknown as T);
        } catch (err) {
          console.warn(`${label} fetch failed`, err);
          return [] as unknown as T;
        }
      };

      // Profile
      const { data: prof } = await supabase.from("profiles").select("id, full_name, updated_at").eq("id", userId).maybeSingle();
      if (!guard()) return;
      const initial = ((prof as ProfileRow | null)?.full_name ?? "").trim();
      setFullName(initial);
      setNameDraft(initial);

      // Enrollments + courses
      const { data: enrData } = await supabase
        .from("enrollments")
        .select("course_id, progress_pct, courses!inner(id,title,slug,img,cpd_points)")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      if (!guard()) return;

      let enrolledTmp: EnrolledCourse[] = [];
      const localMeta: Record<string, CourseMeta> = {};
      let courseIds: string[] = [];

      if (enrData) {
        const rows = enrData as unknown as EnrollmentRow[];
        enrolledTmp = rows.map((r) => {
          const c = pickCourse(r.courses) || { id: "", slug: "", title: "", img: null, cpd_points: null };
          if (r.course_id) courseIds.push(r.course_id);
          if (r.course_id && c.title) {
            localMeta[r.course_id] = { title: c.title, slug: c.slug, cpd_points: c.cpd_points ?? null, img: c.img ?? null };
          }
          return { course_id: r.course_id, progress_pct: 0, title: c.title, slug: c.slug, img: c.img ?? null, cpd_points: c.cpd_points ?? null };
        });
      }

      // Compute progress from slides for all courses (mirror main site)
      courseIds = Array.from(new Set(courseIds));
      if (courseIds.length > 0) {
        const { data: chRows } = await supabase.from("course_chapters").select("id,course_id").in("course_id", courseIds);
        if (!guard()) return;
        const chaptersByCourse: Record<string, string[]> = {};
        (chRows ?? []).forEach((r: { id: string; course_id: string }) => {
          (chaptersByCourse[r.course_id] ||= []).push(r.id);
        });

        const allChapterIds = Object.values(chaptersByCourse).flat();
        const totalSlidesByCourse: Record<string, number> = {};
        if (allChapterIds.length > 0) {
          const { data: slRows } = await supabase.from("course_slides").select("id,chapter_id").in("chapter_id", allChapterIds);
          if (!guard()) return;
          const slidesByChapterCount: Record<string, number> = {};
          (slRows ?? []).forEach((s: { id: string; chapter_id: string }) => {
            slidesByChapterCount[s.chapter_id] = (slidesByChapterCount[s.chapter_id] ?? 0) + 1;
          });
          for (const cid of courseIds) {
            const chIds = chaptersByCourse[cid] ?? [];
            totalSlidesByCourse[cid] = chIds.reduce((acc, chId) => acc + (slidesByChapterCount[chId] ?? 0), 0);
          }
        }

        const { data: progRows } = await supabase
          .from("user_slide_progress")
          .select("course_id, slide_id")
          .eq("user_id", userId)
          .in("course_id", courseIds);
        if (!guard()) return;

        const doneByCourse: Record<string, Set<string>> = {};
        (progRows ?? []).forEach((r: { course_id: string; slide_id: string }) => {
          (doneByCourse[r.course_id] ||= new Set<string>()).add(r.slide_id);
        });

        enrolledTmp = enrolledTmp.map((e) => {
          const total = Math.max(0, totalSlidesByCourse[e.course_id] ?? 0);
          const done = doneByCourse[e.course_id]?.size ?? 0;
          const pct = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
          return { ...e, progress_pct: pct };
        });
      }
      setEnrolled(enrolledTmp);

      // Start a local accumulator for course meta to avoid stale state usage
      let metaAccumulator: Record<string, CourseMeta> = { ...courseMetaMap, ...localMeta };

      // Purchased E-Books (paid only)
      const { data: purRows } = await supabase
        .from("ebook_purchases")
        .select("ebook_id,status,ebooks!inner(id,slug,title,cover_url,price_cents)")
        .eq("user_id", userId)
        .eq("status", "paid")
        .order("created_at", { ascending: false });
      if (!guard()) return;
      if (purRows) {
        const items = (purRows as unknown as PurchaseRow[])
          .map((p) => {
            const e = pickEbook(p.ebooks);
            if (!e) return null;
            return {
              ebook_id: p.ebook_id,
              slug: e.slug,
              title: e.title,
              cover_url: e.cover_url ?? null,
              price_cedis: `GH₵ ${((e.price_cents ?? 0) / 100).toFixed(2)}`,
            } as PurchasedEbook;
          })
          .filter(Boolean) as PurchasedEbook[];
        setEbooks(items);
      }

      // Quiz attempts
      const quizRows = await safeSelect(
        "user_chapter_quiz",
        async () =>
          await supabase
            .from("user_chapter_quiz")
            .select("course_id, chapter_id, total_count, correct_count, score_pct, completed_at")
            .eq("user_id", userId),
      );
      if (!guard()) return;
      const attempts = (quizRows as unknown as QuizAttempt[]) ?? [];
      setQuiz(attempts);

      // Chapters for quiz display
      const chapterIds = Array.from(new Set(attempts.map((a) => a.chapter_id))).filter(Boolean);
      if (chapterIds.length > 0) {
        const { data: chapterRows } = await supabase
          .from("course_chapters")
          .select("id,title,order_index,course_id")
          .in("id", chapterIds);
        if (!guard()) return;
        const map: Record<string, ChapterInfo> = {};
        (chapterRows as unknown as ChapterInfo[] | null | undefined)?.forEach((row) => {
          map[row.id] = { id: row.id, title: row.title, order_index: Number(row.order_index ?? 0), course_id: row.course_id };
        });
        setChaptersById(map);
      }

      // Ensure Course Meta
      const existingIds = new Set(Object.keys(metaAccumulator));
      const metaMissingFromQuiz = Array.from(new Set(attempts.map((a) => a.course_id))).filter(Boolean).filter((cid) => !existingIds.has(cid));
      const metaMissingFromEnroll = Array.from(new Set(enrolledTmp.map((e) => e.course_id))).filter((cid) => !existingIds.has(cid));
      const toFetch = Array.from(new Set([...metaMissingFromQuiz, ...metaMissingFromEnroll]));
      const fetchedMeta: Record<string, CourseMeta> = {};
      if (toFetch.length > 0) {
        const { data: courseRows } = await supabase.from("courses").select("id,title,slug,cpd_points,img").in("id", toFetch);
        if (!guard()) return;
        (courseRows as CourseRow[] | null | undefined)?.forEach((cr) => {
          fetchedMeta[cr.id] = { title: cr.title, slug: cr.slug, cpd_points: cr.cpd_points ?? null, img: cr.img ?? null };
        });
      }
      metaAccumulator = { ...metaAccumulator, ...fetchedMeta };

      /* Certificates (hydrate meta as needed) */
      let certificateNoMissing = false;
      let certRows: unknown[] | null = null;
      let certErr: unknown = null;
      try {
        const primary = await supabase
          .from("certificates")
          .select("id,user_id,course_id,attempt_id,certificate_no,issued_at,courses:course_id(id,title,slug,img,cpd_points)")
          .eq("user_id", userId)
          .order("issued_at", { ascending: false });
        if (!guard()) return;
        certRows = primary.data ?? [];
        certErr = primary.error;
      } catch (err) {
        console.warn("certificates fetch failed", err);
        certRows = [];
        certErr = err;
      }
      if (certErr && typeof certErr === "object" && (certErr as { code?: string }).code === "42703") {
        certificateNoMissing = true;
        try {
          const fallback = await supabase
            .from("certificates")
            .select("id,user_id,course_id,attempt_id,issued_at,courses:course_id(id,title,slug,img,cpd_points)")
            .eq("user_id", userId)
            .order("issued_at", { ascending: false });
          if (!guard()) return;
          certRows = fallback.data ?? [];
          certErr = fallback.error;
        } catch (err) {
          console.warn("certificates fallback fetch failed", err);
          certRows = [];
          certErr = err;
        }
      }
      if (certErr) console.error("certificates fetch error", certErr);

      const bare = (certRows ?? []) as {
        id: string; user_id: string; course_id: string; attempt_id: string | null; certificate_no?: string | null; issued_at: string;
        courses?: { id: string; title: string; slug: string; img: string | null; cpd_points: number | null } | null;
      }[];

      const attemptIds = Array.from(new Set(bare.map((c) => c.attempt_id).filter(Boolean))) as string[];
      const attemptScores: Record<string, number> = {};
      if (attemptIds.length > 0) {
        try {
          const { data: attemptRows, error: attemptErr } = await supabase
            .from("attempts")
            .select("id,score")
            .in("id", attemptIds);
          if (!guard()) return;
          if (attemptErr) console.error("attempts fetch error", attemptErr);
          (attemptRows ?? []).forEach((row: { id: string; score: number | null }) => {
            attemptScores[row.id] = Math.round(Number(row.score ?? 0));
          });
        } catch (err) {
          console.warn("attempts fetch failed", err);
        }
      }

      const certCourseIds = Array.from(new Set(bare.map((c) => c.course_id))).filter(Boolean);
      const missingForCerts = certCourseIds.filter((cid) => !metaAccumulator[cid]);
      const certMeta: Record<string, CourseMeta> = {};
      // Seed meta from joined courses (if present)
      bare.forEach((c) => {
        if (c.courses?.id) {
          certMeta[c.course_id] = {
            title: c.courses.title,
            slug: c.courses.slug,
            img: c.courses.img ?? null,
            cpd_points: c.courses.cpd_points ?? null,
          };
        }
      });
      const stillMissing = missingForCerts.filter((cid) => !certMeta[cid]);
      if (stillMissing.length > 0) {
        const { data: moreCourses } = await supabase.from("courses").select("id,title,slug,img,cpd_points").in("id", stillMissing);
        if (!guard()) return;
        (moreCourses as CourseRow[] | null | undefined)?.forEach((cr) => {
          certMeta[cr.id] = { title: cr.title, slug: cr.slug, cpd_points: cr.cpd_points ?? null, img: cr.img ?? null };
        });
      }

      const mergedCerts: CertificateRow[] = bare.map((c) => {
        const certificateNumber =
          typeof c.certificate_no === "string" && c.certificate_no.trim().length > 0
            ? c.certificate_no
            : certificateNoMissing
              ? makeKdsCertId(userId, c.course_id)
              : makeKdsCertId(userId, c.course_id);
        const meta = certMeta[c.course_id] || metaAccumulator[c.course_id];
        return {
          ...c,
          certificate_no: certificateNumber,
          score_pct: c.attempt_id ? attemptScores[c.attempt_id] ?? null : null,
          courses: meta
            ? { title: meta.title, slug: meta.slug, img: meta.img ?? null, cpd_points: meta.cpd_points ?? null }
            : { title: "Course", slug: "", img: null, cpd_points: null },
        };
      });
      setCerts(mergedCerts);

      metaAccumulator = { ...metaAccumulator, ...certMeta };

      /* Provisional (passed + 100% progress, awaiting issuance) */
      if (courseIds.length > 0) {
        const { data: examRows, error: examErr } = await supabase.from("exams").select("id,course_id,title,pass_mark").in("course_id", courseIds);
        if (!guard()) return;
        if (examErr) console.warn("exams fetch error", examErr);
        const examByCourse: Record<string, ExamRow> = {};
        const examIds: string[] = [];
        (examRows ?? []).forEach((e: ExamRow) => {
          examByCourse[e.course_id] = e;
          examIds.push(e.id);
        });

        let latestByExam: Record<string, AttemptRow> = {};
        if (examIds.length > 0) {
          const { data: attRows, error: attErr } = await supabase
            .from("attempts")
            .select("id,user_id,exam_id,score,passed,created_at")
            .eq("user_id", userId)
            .in("exam_id", examIds)
            .order("created_at", { ascending: false });
          if (!guard()) return;
          if (attErr) console.warn("attempts fetch error", attErr);

          latestByExam = {};
          (attRows ?? []).forEach((a: AttemptRow) => {
            if (!latestByExam[a.exam_id]) latestByExam[a.exam_id] = a;
          });
        }

        const realCertCourseIds = new Set(mergedCerts.map((c) => c.course_id));
        const progressByCourse: Record<string, number> = {};
        for (const e of enrolledTmp) progressByCourse[e.course_id] = e.progress_pct;

        const provisional: {
          course_id: string; course_title: string; course_slug: string; img: string | null; cpd_points: number | null; score_pct: number; passed_at: string;
        }[] = [];

        for (const cid of courseIds) {
          if (realCertCourseIds.has(cid)) continue;
          const exam = examByCourse[cid];
          if (!exam) continue;
          const att = latestByExam[exam.id];
          const passed = !!(att && att.passed && (att.score ?? 0) >= (exam.pass_mark ?? 0));
          const hundred = (progressByCourse[cid] ?? 0) >= 100;

          if (passed && hundred) {
            const meta = certMeta[cid] || metaAccumulator[cid] || localMeta[cid];
            provisional.push({
              course_id: cid,
              course_title: meta?.title ?? "Course",
              course_slug: meta?.slug ?? "",
              img: meta?.img ?? null,
              cpd_points: (meta?.cpd_points ?? null) as number | null,
              score_pct: Math.round(Number(att?.score ?? 0)),
              passed_at: att!.created_at,
            });
          }
        }

        setProvisionalCerts(provisional);
      }

      // Finalize shared meta map for UI
      setCourseMetaMap(metaAccumulator);

      setLoading(false);
    })();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [sessionReady, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Name save
  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!userId || !trimmed) return;
    await supabase.from("profiles").upsert({ id: userId, full_name: trimmed, updated_at: new Date().toISOString() });
    setFullName(trimmed);
    setIsEditingName(false);
  }

  // Group quiz rows by course
  const quizByCourse = useMemo(() => {
    const grouped: Record<string, { attempt: QuizAttempt; chapter: ChapterInfo }[]> = {};
    for (const a of quiz) {
      const ch = chaptersById[a.chapter_id];
      if (!ch) continue;
      (grouped[a.course_id] ||= []).push({ attempt: a, chapter: ch });
    }
    for (const k of Object.keys(grouped)) {
      grouped[k].sort((l, r) => (l.chapter.order_index ?? 0) - (r.chapter.order_index ?? 0));
    }
    return grouped;
  }, [quiz, chaptersById]);

  const makeKdsCertId = (u: string, courseId?: string) => `KDS-${u.slice(0, 8).toUpperCase()}${courseId ? "-" + courseId.slice(0, 6).toUpperCase() : ""}`;
  const origin = typeof window !== "undefined" && window.location ? window.location.origin : "https://kdslearning.com";

  const downloadCertPdf = async (
    certId: string,
    {
      recipient,
      course,
      issuedAt,
      certNumber,
      verifyUrl,
    }: { recipient: string; course: string; issuedAt: string | Date; certNumber: string; verifyUrl?: string },
  ) => {
    try {
      if (downloadingCertId) return;
      setDownloadingCertId(certId);
      const { jsPDF } = await import("jspdf");
      if (typeof window === "undefined") throw new Error("No window");

      const toDataUrl = async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`asset fetch failed: ${url}`);
        const blob = await res.blob();
        const buf = await blob.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        return `data:${blob.type};base64,${base64}`;
      };

      const makeGradient = (w: number, h: number, stops: { offset: number; color: string }[]) => {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return "";
        const g = ctx.createLinearGradient(0, 0, w, 0);
        stops.forEach((s) => g.addColorStop(s.offset, s.color));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        return canvas.toDataURL("image/png");
      };

      const logoUrl = "/logo.png";
      const signatureUrl = "https://icujvqmqwacpysxjfkxd.supabase.co/storage/v1/object/public/Cert%20Assets/Prof%20Signature.png";

      const [logoData, sigData, qrData] = await Promise.all([
        toDataUrl(logoUrl).catch(() => ""),
        toDataUrl(signatureUrl).catch(() => ""),
        verifyUrl ? toDataUrl(`https://quickchart.io/qr?text=${encodeURIComponent(verifyUrl)}&size=280&margin=1`).catch(() => "") : Promise.resolve(""),
      ]);
      const headerGradient = makeGradient(2000, 260, [
        { offset: 0, color: PANABLUE },
        { offset: 0.65, color: PANABLUE },
        { offset: 0.75, color: "#d2a756" },
        { offset: 1, color: "#f1d48f" },
      ]);

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;

      // Background
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, "F");

      // Border
      doc.setDrawColor(10, 17, 86);
      doc.setLineWidth(3);
      doc.rect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2);

      // Header band
      const headerHeight = 28;
      if (headerGradient) {
        doc.addImage(headerGradient, "PNG", margin + 4, margin + 4, pageWidth - (margin + 4) * 2, headerHeight, undefined, "FAST");
      } else {
        doc.setFillColor(10, 17, 86);
        doc.rect(margin + 4, margin + 4, pageWidth - (margin + 4) * 2, headerHeight, "F");
      }
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("CERTIFICATE", margin + 10, margin + 16, { align: "left" });
      doc.text("of Appreciation", margin + 10, margin + 24, { align: "left" });
      if (logoData) {
        doc.addImage(logoData, "PNG", pageWidth - margin - 26, margin + 8, 22, 12, undefined, "FAST");
      }

      // Body
      const centerX = pageWidth / 2;
      let cursorY = margin + headerHeight + 26;

      doc.setTextColor(10, 17, 86);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("Proudly Presented To", centerX, cursorY, { align: "center" });
      cursorY += 16;

      doc.setFontSize(34);
      doc.setFont("helvetica", "bold");
      doc.text(recipient || "Your Name", centerX, cursorY, { align: "center" });
      cursorY += 16;

      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(55, 65, 81);
      doc.text("for successfully completing", centerX, cursorY, { align: "center" });
      cursorY += 14;

      doc.setFont("helvetica", "italic");
      doc.setFontSize(19);
      doc.setTextColor(31, 41, 55);
      doc.text(course, centerX, cursorY, { align: "center" });
      cursorY += 20;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(55, 65, 81);
      doc.text(`Certificate No: ${certNumber}`, centerX, cursorY, { align: "center" });
      cursorY += 10;
      doc.text(`Issued: ${new Date(issuedAt).toLocaleDateString()}`, centerX, cursorY, { align: "center" });

      // Footer: signature left, QR right
      const footerY = pageHeight - margin - 32;
      const leftX = margin + 16;
      const rightX = pageWidth - margin - 22;

      if (sigData) {
        doc.addImage(sigData, "PNG", leftX, footerY - 16, 60, 18, undefined, "FAST");
      }
      doc.setDrawColor(10, 17, 86);
      doc.setLineWidth(0.6);
      doc.line(leftX, footerY + 4, leftX + 70, footerY + 4);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(10, 17, 86);
      doc.text("Authorized Signatory", leftX + 35, footerY + 12, { align: "center" });

      if (qrData) {
        const qrSize = 38;
        const qrTop = pageHeight - margin - qrSize - 10;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(55, 65, 81);
        doc.text("Scan to verify", rightX, qrTop - 6, { align: "center" });
        doc.addImage(qrData, "PNG", rightX - qrSize / 2, qrTop, qrSize, qrSize, undefined, "FAST");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(10, 17, 86);
        doc.text(certNumber, rightX, qrTop + qrSize + 8, { align: "center" });
      }

      const filename = certNumber ? `PanAvest-Certificate-${certNumber}.pdf` : "PanAvest-Certificate.pdf";
      doc.save(filename);
    } catch (err) {
      console.error("Certificate PDF generation failed", err);
      if (typeof window !== "undefined") {
        window.alert("We could not download the certificate. Please try again.");
      }
    } finally {
      setDownloadingCertId(null);
    }
  };

  // Early show
  if (!sessionReady) {
    return (
      <div className="min-h-[100svh] bg-[color:var(--color-light)]/40">
        <AppHeader name="" onEdit={() => {}} />
        <main className="mx-auto max-w-screen-md px-4 py-6">
          <p className="text-sm text-muted">Checking your session…</p>
        </main>

      </div>
    );
  }

  return (
    <div className="min-h-[100svh] bg-[color:var(--color-light)]/40">
      <AppHeader name={fullName} onEdit={() => setIsEditingName(true)} />

      {/* Name editor sheet */}
      {isEditingName && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-end md:items-center md:justify-center">
          <div className="w-full md:w-[520px] rounded-t-2xl md:rounded-2xl bg-white shadow-lg p-4">
            <h3 className="text-base font-semibold">Display name</h3>
            <p className="text-xs text-muted">Your certificates use this name.</p>
            <div className="mt-3 flex items-center gap-2">
              <input
                className="flex-1 rounded-md border px-3 py-2 text-sm"
                placeholder="Your full name"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
              />
              <button onClick={saveName} className="rounded-lg px-4 py-2 text-sm text-white" style={{ backgroundColor: PANABLUE }}>
                Save
              </button>
              <button onClick={() => { setIsEditingName(false); setNameDraft(fullName); }} className="rounded-lg border px-4 py-2 text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-screen-md pb-[88px]">
        {/* Quick Actions */}
        <div className="px-4 pt-4 grid grid-cols-3 gap-3">
          <Link href="/courses" className="rounded-xl bg-white border border-light p-3 text-center text-sm font-medium">Explore</Link>
          <Link href="/ebooks" className="rounded-xl bg-white border border-light p-3 text-center text-sm font-medium">E-Books</Link>
          <Link href="/dashboard#scores" className="rounded-xl bg-white border border-light p-3 text-center text-sm font-medium">Scores</Link>
        </div>

        {/* 1) E-Books carousel */}
        <Section title="Purchased E-Books">
          {loading ? (
            <div className="px-4"><div className="h-36 rounded-xl bg-white border border-light animate-pulse" /></div>
          ) : ebooks.length === 0 ? (
            <div className="px-4">
              <div className="rounded-xl border border-light bg-white p-4">
                <p className="text-sm text-muted">No purchased e-books yet.</p>
                <Link href="/ebooks" className="mt-2 inline-block rounded-lg px-4 py-2 text-white" style={{ backgroundColor: PANABLUE }}>
                  Browse e-books
                </Link>
              </div>
            </div>
          ) : (
            <div className="px-4">
              <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none]"
                   style={{ WebkitOverflowScrolling: "touch" }}>
                {/* Hide scrollbar */}
                <style jsx>{`
                  div::-webkit-scrollbar { display: none; }
                `}</style>
                {ebooks.map((b) => (
                  <Link
                    key={b.ebook_id}
                    href={`/ebooks/${b.slug}`}
                    className="snap-start shrink-0 w-[220px] rounded-xl border border-light bg-white overflow-hidden"
                  >
                    <div className="relative w-[220px] h-[140px]">
                      <Image
                        src={b.cover_url || "/project-management.png"}
                        alt={b.title}
                        fill
                        className="object-cover"
                        sizes="220px"
                      />
                    </div>
                    <div className="p-3">
                      <div className="text-sm font-semibold line-clamp-1">{b.title}</div>
                      <div className="mt-0.5 text-[11px] text-muted">{b.price_cedis}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* 2) Continue Learning (2 columns) */}
        <Section title="Continue learning">
          {loading ? (
            <div className="px-4"><div className="h-28 rounded-xl bg-white border border-light animate-pulse" /></div>
          ) : enrolled.length === 0 ? (
            <div className="px-4">
              <div className="rounded-xl border border-light bg-white p-4">
                <p className="text-sm text-muted">You haven’t enrolled yet.</p>
                <Link href="/courses" className="mt-2 inline-block rounded-lg px-4 py-2 text-white" style={{ backgroundColor: PANABLUE }}>
                  Browse knowledge
                </Link>
              </div>
            </div>
          ) : (
            <div className="px-4 grid grid-cols-2 gap-4">
              {enrolled.map((c) => (
                <div key={c.course_id} className="rounded-xl border border-light bg-white overflow-hidden">
                  <div className="relative w-full h-28">
                    <Image
                      src={c.img || "/project-management.png"}
                      alt={c.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 50vw, 33vw"
                    />
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-semibold line-clamp-1">{c.title}</div>
                    <div className="mt-2">
                      <ProgressBar value={c.progress_pct} />
                    </div>
                    <div className="mt-1 text-[11px] text-muted">{Math.round(c.progress_pct)}% complete</div>
                    <Link
                      href={`/courses/${c.slug}/dashboard`}
                      className="mt-2 inline-block rounded-lg px-3 py-1.5 text-xs text-white"
                      style={{ backgroundColor: PANABLUE }}
                    >
                      Resume
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 2.5) Certificates */}
        <Section title="Course certificates" anchor="certificates">
          {loading ? (
            <div className="px-4"><div className="h-28 rounded-xl bg-white border border-light animate-pulse" /></div>
          ) : (certs.length + provisionalCerts.length === 0 ? (
            <div className="px-4">
              <div className="rounded-xl border border-light bg-white p-4">
                <p className="text-sm text-muted">No certificates yet. Complete a course and pass the final exam to earn one.</p>
              </div>
            </div>
          ) : (
            <div className="px-4 grid gap-4">
              {certs.map((c) => {
                const courseTitle = c.courses?.title ?? "Course";
                const courseSlug = c.courses?.slug ?? "";
                const bg = c.courses?.img ?? "/project-management.png";
                const cpd = (c.courses?.cpd_points ?? null) as number | null;
                const kdsCertId = makeKdsCertId(userId, c.course_id);
                const verifyUrl = `${origin}/verify?cert_id=${encodeURIComponent(c.id)}`;

                return (
                  <div key={c.id} className="rounded-xl border border-light bg-white overflow-hidden">
                    <div className="relative w-full h-28">
                      <Image src={bg} alt={courseTitle} fill className="object-cover" sizes="(max-width:768px) 100vw, 50vw" />
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold line-clamp-1">{courseTitle}</div>
                        {courseSlug && (
                          <Link href={`/courses/${courseSlug}/dashboard`} className="text-xs rounded-md px-2 py-1 bg-[color:var(--color-light)]">
                            View
                          </Link>
                        )}
                      </div>

                      <div className="text-[11px] text-muted space-y-0.5">
                        <div><span className="font-medium text-ink">Issued to:</span> {fullName || "—"}</div>
                        <div>Certificate No: {c.certificate_no}</div>
                        <div>Issued: {new Date(c.issued_at).toLocaleString()}</div>
                        {cpd != null && <div>CPD/CPPD: {cpd}</div>}
                      </div>

                      <details className="rounded-lg border border-dashed p-3 open:shadow-sm">
                        <summary className="cursor-pointer text-sm font-medium">Preview</summary>
                        <div className="mt-3">
                          <SimpleCertificate
                            recipient={fullName || "Your Name"}
                            course={courseTitle}
                            date={c.issued_at}
                            certId={kdsCertId}
                            qrValue={verifyUrl}
                            showPrint={false}
                            accent={PANABLUE}
                          />
                        </div>
                      </details>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            downloadCertPdf(c.id, {
                              recipient: fullName || "Your Name",
                              course: courseTitle,
                              issuedAt: c.issued_at,
                              certNumber: kdsCertId,
                              verifyUrl,
                            })
                          }
                          disabled={downloadingCertId === c.id}
                          className="rounded-lg px-3 py-1.5 text-xs text-white disabled:opacity-60"
                          style={{ backgroundColor: PANABLUE }}
                        >
                          {downloadingCertId === c.id ? "Preparing…" : "Download certificate"}
                        </button>
                        <span className="text-[11px] text-muted">Final score: {c.score_pct != null ? `${c.score_pct}%` : "—"}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {provisionalCerts.map((pc) => {
                const kdsCertId = makeKdsCertId(userId, pc.course_id);
                return (
                  <div key={`provisional-${pc.course_id}`} className="rounded-xl border border-light bg-white overflow-hidden">
                    <div className="relative w-full h-28">
                      <Image src={pc.img ?? "/project-management.png"} alt={pc.course_title} fill className="object-cover" sizes="(max-width:768px) 100vw, 50vw" />
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold line-clamp-1">{pc.course_title}</div>
                        {pc.course_slug && (
                          <Link href={`/courses/${pc.course_slug}/dashboard`} className="text-xs rounded-md px-2 py-1 bg-[color:var(--color-light)]">
                            View
                          </Link>
                        )}
                      </div>

                      <div className="text-[11px] text-muted space-y-0.5">
                        <div><span className="font-medium text-ink">Issued to:</span> {fullName || "—"}</div>
                        <div>Status: Provisional (awaiting issuance)</div>
                        <div>Passed: {new Date(pc.passed_at).toLocaleString()}</div>
                        {pc.cpd_points != null && <div>CPD/CPPD: {pc.cpd_points}</div>}
                        <div>Certificate No: {kdsCertId}</div>
                      </div>

                      <div className="rounded-lg border border-dashed p-3">
                        <SimpleCertificate
                          recipient={fullName || "Your Name"}
                          course={pc.course_title}
                          date={pc.passed_at}
                          certId={kdsCertId}
                          qrProvider="none"
                          showPrint
                          accent={PANABLUE}
                        />
                        <div className="mt-2 text-[11px] text-muted">Official download available after issuance.</div>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-muted">
                        <span className="rounded-lg px-2 py-1 bg-[color:var(--color-light)]">Passed: {pc.score_pct}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </Section>

        {/* 3) Scores (grouped per course) */}
        <Section title="Your scores" anchor="scores">
          {loading ? (
            <div className="px-4"><div className="h-28 rounded-xl bg-white border border-light animate-pulse" /></div>
          ) : Object.keys(quizByCourse).length === 0 ? (
            <div className="px-4">
              <div className="rounded-xl border border-light bg-white p-4">
                <p className="text-sm text-muted">No quiz attempts yet.</p>
              </div>
            </div>
          ) : (
            <div className="px-4 grid gap-4">
              {Object.entries(quizByCourse).map(([courseId, rows]) => {
                const meta = courseMetaMap[courseId];
                return (
                  <div key={courseId} className="rounded-xl border border-light bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold line-clamp-1">{meta?.title ?? "Course"}</div>
                      {meta?.slug && (
                        <Link
                          href={`/courses/${meta.slug}/dashboard`}
                          className="text-xs rounded-md px-2 py-1 bg-[color:var(--color-light)]"
                        >
                          Go to course
                        </Link>
                      )}
                    </div>
                    <ul className="mt-3 grid gap-2">
                      {rows.map(({ attempt, chapter }) => (
                        <li
                          key={`${attempt.course_id}-${attempt.chapter_id}-${attempt.completed_at}`}
                          className="flex items-center justify-between gap-2 rounded-lg ring-1 ring-[var(--color-light)] px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium line-clamp-1">{chapter.title}</div>
                            <div className="text-[11px] text-muted">
                              {attempt.correct_count}/{attempt.total_count} correct · {new Date(attempt.completed_at).toLocaleString()}
                            </div>
                          </div>
                          <span className="shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold bg-[color:var(--color-light)]">
                            {attempt.score_pct}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Spacer for fixed navbar */}
        <div className="h-[80px]" />
      </main>

      
    </div>
  );
}
