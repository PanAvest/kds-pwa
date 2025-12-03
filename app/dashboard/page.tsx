// Behaviour: Dashboard per README-upgrade.md. Aligns PWA with main site: slide-based progress, purchased e-books,
// quiz history, issued + provisional certificates with verify URLs, and download flow that splits web (jsPDF.save)
// vs native (Filesystem + Share). Manual test: check cert cards render with QR verify link, download works in browser
// and opens share sheet on device, provisional appears after 100% slides + passed exam without a certificate row.
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { ProgressBar } from "@/components/ProgressBar";
import SimpleCertificate from "@/components/SimpleCertificate";
import { isNativePlatform, savePdfToDevice } from "@/lib/nativeDownload";
import { isNativeApp } from "@/lib/nativePlatform";

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
  attempt_id?: string | null;
  certificate_no?: string | null;
  issued_at?: string | null;
  courses?: CourseRow | CourseRow[] | null;
};
type AttemptRow = { id: string; exam_id?: string | null; score: number | null; passed: boolean | null; created_at?: string | null };
type ExamRow = { id: string; course_id: string; title: string | null; pass_mark: number | null };
type CertificateView = {
  id: string;
  courseId: string;
  courseTitle: string;
  courseSlug?: string;
  courseImg?: string | null;
  cpdPoints?: number | null;
  certificateNo: string;
  issuedAt: string;
  scorePct?: number | null;
  verifyUrl: string;
  attemptId?: string | null;
};
type ProvisionalCertificate = {
  courseId: string;
  courseTitle: string;
  courseSlug?: string;
  courseImg?: string | null;
  cpdPoints?: number | null;
  certificateNo: string;
  issuedAt: string;
  scorePct?: number | null;
};

function pickCourse(c: CourseRow | CourseRow[] | null | undefined): CourseRow | null {
  if (!c) return null;
  return Array.isArray(c) ? (c[0] ?? null) : c;
}
function pickEbook(e: EbookRow | EbookRow[] | null | undefined): EbookRow | null {
  if (!e) return null;
  return Array.isArray(e) ? (e[0] ?? null) : e;
}

const makeKdsCertId = (u: string, courseId?: string) =>
  `KDS-${u.slice(0, 8).toUpperCase()}${courseId ? `-${courseId.slice(0, 6).toUpperCase()}` : ""}`;

const PANABLUE = "#0a1156";

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("toDataUrl failed", e);
    return null;
  }
}

function makeGradientDataUrl(width: number, height: number, start = PANABLUE, end = "#142ba0") {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, start);
  gradient.addColorStop(1, end);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL("image/png");
}

type DownloadCertOptions = {
  certNumber: string;
  recipient: string;
  courseTitle: string;
  issuedAt: string;
  verifyUrl?: string | null;
  cpdPoints?: number | null;
  scorePct?: number | null;
};

// Manual test: click download on a certificate. On web it should save directly; on native it should open a share/save
// sheet. Verify QR encodes the verify URL.
async function downloadCertPdf(options: DownloadCertOptions) {
  const { certNumber, recipient, courseTitle, issuedAt, verifyUrl, cpdPoints, scorePct } = options;
  const filename = certNumber ? `PanAvest-Certificate-${certNumber}.pdf` : "PanAvest-Certificate.pdf";
  const origin = typeof window !== "undefined" && window.location ? window.location.origin : "https://kdslearning.com";

  try {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 16;

    // Border
    doc.setDrawColor(10, 17, 86);
    doc.setLineWidth(1);
    doc.rect(margin / 2, margin / 2, pageWidth - margin, pageHeight - margin, "S");

    // Header gradient
    const grad = typeof window !== "undefined" ? makeGradientDataUrl(800, 80) : null;
    if (grad) doc.addImage(grad, "PNG", 0, 0, pageWidth, 22);

    // Logo
    const logoUrl = `${origin}/logo.png`;
    const logoData = typeof window !== "undefined" ? await toDataUrl(logoUrl) : null;
    if (logoData) doc.addImage(logoData, "PNG", margin, 8, 24, 12);

    doc.setFontSize(18);
    doc.setTextColor(10, 17, 86);
    doc.text("Knowledge Development Series", pageWidth / 2, 20, { align: "center" });

    doc.setTextColor(60, 60, 60);
    doc.setFontSize(12);
    doc.text("Certificate of Completion", pageWidth / 2, 30, { align: "center" });

    doc.setFontSize(22);
    doc.setTextColor(10, 17, 86);
    doc.text(recipient || "Learner", pageWidth / 2, 52, { align: "center" });

    doc.setFontSize(12);
    doc.setTextColor(80, 80, 80);
    doc.text("has successfully completed", pageWidth / 2, 62, { align: "center" });

    doc.setFontSize(16);
    doc.setTextColor(20, 20, 20);
    doc.text(courseTitle || "Course", pageWidth / 2, 72, { align: "center" });

    doc.setFontSize(11);
    doc.text("For successfully completing the prescribed curriculum and assessments.", pageWidth / 2, 82, {
      align: "center",
    });

    const issuedDate = new Date(issuedAt);
    const issuedStr = isNaN(issuedDate.getTime()) ? issuedAt : issuedDate.toLocaleDateString();

    doc.setTextColor(30, 30, 30);
    doc.text(`Certificate No: ${certNumber}`, margin, 100);
    doc.text(`Issued: ${issuedStr}`, margin, 108);
    if (typeof cpdPoints === "number") doc.text(`CPD Points: ${cpdPoints}`, margin, 116);
    if (typeof scorePct === "number") doc.text(`Score: ${scorePct}%`, margin, 124);

    // Signature placeholder
    doc.text("Authorized Signatory", margin, pageHeight - 40);
    doc.text("Prof. Douglas Boateng", margin, pageHeight - 34);
    doc.text("D.Prof., FCILT, FIoD, FIOM, FAC, FIAM, FCIPS, FIC", margin, pageHeight - 30);

    // QR code
    if (verifyUrl) {
      const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(verifyUrl)}&size=300&margin=1`;
      const qrData = typeof window !== "undefined" ? await toDataUrl(qrUrl) : null;
      if (qrData) {
        const size = 40;
        doc.addImage(qrData, "PNG", pageWidth - margin - size, pageHeight - margin - size - 4, size, size);
        doc.setFontSize(9);
        doc.text("Scan to verify", pageWidth - margin - size / 2, pageHeight - margin - size - 8, { align: "center" });
      }
    }

    if (isNativePlatform()) {
      const blob = doc.output("blob");
      await savePdfToDevice(filename, blob);
    } else {
      doc.save(filename);
    }
  } catch (err) {
    console.error("downloadCertPdf failed", err);
  }
}

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
  const [certificates, setCertificates] = useState<CertificateView[]>([]);
  const [provisionalCerts, setProvisionalCerts] = useState<ProvisionalCertificate[]>([]);
  const native = useMemo(() => isNativeApp(), []);

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
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        // Profile
        const { data: prof } = await supabase.from("profiles").select("id, full_name, updated_at").eq("id", userId).maybeSingle();
        if (!alive) return;
        const initial = ((prof as ProfileRow | null)?.full_name ?? "").trim();
        setFullName(initial);
        setNameDraft(initial);

        // Enrollments + courses
        const { data: enrData } = await supabase
          .from("enrollments")
          .select("course_id, progress_pct, courses!inner(id,title,slug,img,cpd_points)")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });

        if (!alive) return;

        let enrolledTmp: EnrolledCourse[] = [];
        const metaTmp: Record<string, CourseMeta> = {};
        const allCourseIds: string[] = [];

        if (enrData) {
          const rows = enrData as unknown as EnrollmentRow[];
          for (const r of rows) {
            const c = pickCourse(r.courses) || { id: "", slug: "", title: "", img: null, cpd_points: null };
            metaTmp[r.course_id] = { title: c.title, slug: c.slug, cpd_points: c.cpd_points ?? null, img: c.img ?? null };
            enrolledTmp.push({
              course_id: r.course_id,
              progress_pct: 0, // will be recomputed from slides for all courses
              title: c.title,
              slug: c.slug,
              img: c.img ?? null,
              cpd_points: c.cpd_points ?? null,
            });
            allCourseIds.push(r.course_id);
          }
        }

        // Compute progress from slides for all enrolled courses (ignore legacy enrollments.progress_pct)
        if (allCourseIds.length > 0) {
          const uniqueCourseIds = Array.from(new Set(allCourseIds));
          const { data: chRows } = await supabase.from("course_chapters").select("id,course_id").in("course_id", uniqueCourseIds);
          const chaptersByCourse: Record<string, string[]> = {};
          const courseByChapter: Record<string, string> = {};
          (chRows ?? []).forEach((r: { id: string; course_id: string }) => {
            (chaptersByCourse[r.course_id] ||= []).push(r.id);
            courseByChapter[r.id] = r.course_id;
          });

          const allChapterIds = Object.values(chaptersByCourse).flat();
          const totalSlidesByCourse: Record<string, number> = {};
          if (allChapterIds.length > 0) {
            const { data: slRows } = await supabase.from("course_slides").select("id,chapter_id").in("chapter_id", allChapterIds);
            (slRows ?? []).forEach((s: { id: string; chapter_id: string }) => {
              const cid = courseByChapter[s.chapter_id];
              if (cid) totalSlidesByCourse[cid] = (totalSlidesByCourse[cid] ?? 0) + 1;
            });
          }

          const { data: progRows } = await supabase
            .from("user_slide_progress")
            .select("course_id, slide_id")
            .eq("user_id", userId)
            .in("course_id", uniqueCourseIds);

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
        setCourseMetaMap((prev) => ({ ...metaTmp, ...prev }));

        // Purchased E-Books (paid only)
        const { data: purRows } = await supabase
          .from("ebook_purchases")
          .select("ebook_id,status,ebooks!inner(id,slug,title,cover_url,price_cents)")
          .eq("user_id", userId)
          .eq("status", "paid")
          .order("created_at", { ascending: false });

        if (!alive) return;
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
        const { data: quizRows } = await supabase
          .from("user_chapter_quiz")
          .select("course_id, chapter_id, total_count, correct_count, score_pct, completed_at")
          .eq("user_id", userId);
        const attempts = (quizRows as unknown as QuizAttempt[]) ?? [];
        setQuiz(attempts);

        // Chapters for quiz display
        const chapterIds = Array.from(new Set(attempts.map((a) => a.chapter_id))).filter(Boolean);
        if (chapterIds.length > 0) {
          const { data: chapterRows } = await supabase
            .from("course_chapters")
            .select("id,title,order_index,course_id")
            .in("id", chapterIds);
          const map: Record<string, ChapterInfo> = {};
          (chapterRows as unknown as ChapterInfo[] | null | undefined)?.forEach((row) => {
            map[row.id] = { id: row.id, title: row.title, order_index: Number(row.order_index ?? 0), course_id: row.course_id };
          });
          setChaptersById(map);
        }

        // Certificates + provisional logic
        const origin = typeof window !== "undefined" && window.location ? window.location.origin : "https://kdslearning.com";
        let certRows: CertificateRow[] = [];
        try {
          const { data: certData, error: certErr } = await supabase
            .from("certificates")
            .select("id,user_id,course_id,attempt_id,certificate_no,issued_at,courses:course_id(id,title,slug,img,cpd_points)")
            .eq("user_id", userId)
            .order("issued_at", { ascending: false });
          if (certErr && (certErr as any)?.code === "42703") {
            const { data: certFallback } = await supabase
              .from("certificates")
              .select("id,user_id,course_id,attempt_id,issued_at")
              .eq("user_id", userId)
              .order("issued_at", { ascending: false });
            certRows = (certFallback as unknown as CertificateRow[]) ?? [];
          } else {
            certRows = (certData as unknown as CertificateRow[]) ?? [];
          }
        } catch (e) {
          console.error("certificates fetch failed", e);
        }

        const attemptIds = Array.from(new Set(certRows.map((c) => c.attempt_id).filter(Boolean) as string[]));
        const attemptMap: Record<string, AttemptRow> = {};
        if (attemptIds.length > 0) {
          const { data: attRows } = await supabase
            .from("attempts")
            .select("id, exam_id, score, passed, created_at")
            .in("id", attemptIds);
          (attRows as unknown as AttemptRow[] | null | undefined)?.forEach((a) => {
            attemptMap[a.id] = a;
          });
        }

        const missingCourseIds = certRows
          .map((c) => c.course_id)
          .filter((cid) => !metaTmp[cid] && !pickCourse(certRows.find((row) => row.course_id === cid)?.courses));
        const hydratedMeta: Record<string, CourseMeta> = {};
        if (missingCourseIds.length > 0) {
          const { data: courseRows } = await supabase
            .from("courses")
            .select("id,title,slug,img,cpd_points")
            .in("id", Array.from(new Set(missingCourseIds)));
          (courseRows as CourseRow[] | null | undefined)?.forEach((c) => {
            hydratedMeta[c.id] = { title: c.title, slug: c.slug, img: c.img ?? null, cpd_points: c.cpd_points ?? null };
          });
        }

        const certViews: CertificateView[] = certRows.map((c) => {
          const meta = pickCourse(c.courses) || metaTmp[c.course_id] || hydratedMeta[c.course_id] || { title: "Course", slug: "", img: null, cpd_points: null };
          const certNumber = (c.certificate_no || "").trim() || makeKdsCertId(userId, c.course_id);
          const attempt = c.attempt_id ? attemptMap[c.attempt_id] : undefined;
          const issuedAt = c.issued_at || attempt?.created_at || new Date().toISOString();
          const verifyUrl = `${origin}/verify?cert_id=${encodeURIComponent(c.id)}`;
          return {
            id: c.id,
            courseId: c.course_id,
            courseTitle: meta.title,
            courseSlug: meta.slug,
            courseImg: meta.img,
            cpdPoints: meta.cpd_points,
            certificateNo: certNumber,
            issuedAt,
            scorePct: typeof attempt?.score === "number" ? attempt.score : null,
            verifyUrl,
            attemptId: c.attempt_id ?? undefined,
          };
        });
        setCertificates(certViews);

        // Provisional certificates (100% progress + passed exam, but no certificate row)
        const progressByCourse: Record<string, number> = {};
        enrolledTmp.forEach((e) => {
          progressByCourse[e.course_id] = e.progress_pct;
        });
        const completedCourses = Object.entries(progressByCourse)
          .filter(([, pct]) => pct >= 100)
          .map(([cid]) => cid);
        const coursesWithoutCert = completedCourses.filter((cid) => !certRows.some((c) => c.course_id === cid));

        if (coursesWithoutCert.length > 0) {
          const { data: examRows } = await supabase
            .from("exams")
            .select("id,course_id,title,pass_mark")
            .in("course_id", coursesWithoutCert);
          const examIds = Array.from(new Set((examRows ?? []).map((e: any) => e.id).filter(Boolean)));
          let examAttempts: AttemptRow[] = [];
          if (examIds.length > 0) {
            const { data: attemptRows } = await supabase
              .from("attempts")
              .select("id, exam_id, score, passed, created_at")
              .eq("user_id", userId)
              .in("exam_id", examIds)
              .order("created_at", { ascending: false });
            examAttempts = (attemptRows as unknown as AttemptRow[]) ?? [];
          }

          const latestByExam: Record<string, AttemptRow> = {};
          examAttempts.forEach((a) => {
            if (!a.exam_id) return;
            if (!latestByExam[a.exam_id]) latestByExam[a.exam_id] = a;
          });

          const provisional: ProvisionalCertificate[] = [];
          (examRows as ExamRow[] | null | undefined)?.forEach((exam) => {
            const attempt = latestByExam[exam.id];
            if (!attempt) return;
            const passMark = Number(exam.pass_mark ?? 0);
            const passed = (!!attempt.passed || (attempt.score ?? 0) >= passMark) && (attempt.score ?? 0) >= passMark;
            if (!passed) return;
            const meta = metaTmp[exam.course_id] || hydratedMeta[exam.course_id];
            provisional.push({
              courseId: exam.course_id,
              courseTitle: meta?.title ?? "Course",
              courseSlug: meta?.slug,
              courseImg: meta?.img,
              cpdPoints: meta?.cpd_points ?? null,
              certificateNo: makeKdsCertId(userId, exam.course_id),
              issuedAt: attempt.created_at ?? new Date().toISOString(),
              scorePct: attempt.score ?? null,
            });
          });
          setProvisionalCerts(provisional);
        } else {
          setProvisionalCerts([]);
        }

        setCourseMetaMap((prev) => ({ ...prev, ...metaTmp, ...hydratedMeta }));

        setLoading(false);
      } catch (e) {
        console.error("dashboard load failed:", e);
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [sessionReady, userId]);

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

      <main className={`mx-auto max-w-screen-md ${native ? "pb-2" : "pb-[88px]"}`}>
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

        {/* 3) Certificates */}
        <Section title="Certificates">
          {loading ? (
            <div className="px-4"><div className="h-32 rounded-xl bg-white border border-light animate-pulse" /></div>
          ) : certificates.length === 0 && provisionalCerts.length === 0 ? (
            <div className="px-4">
              <div className="rounded-xl border border-light bg-white p-4">
                <p className="text-sm text-muted">No certificates yet. Complete your courses and exams to unlock them.</p>
              </div>
            </div>
          ) : (
            <div className="px-4 grid gap-4">
              {certificates.map((c) => (
                <div key={c.id} className="rounded-xl border border-light bg-white overflow-hidden">
                  <div className="relative w-full h-28">
                    <Image
                      src={c.courseImg || "/project-management.png"}
                      alt={c.courseTitle}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 50vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-black/5" />
                    <div className="absolute bottom-2 left-3 text-white font-semibold text-sm">{c.courseTitle}</div>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="text-xs text-muted">
                      Issued: {new Date(c.issuedAt).toLocaleDateString()} · Cert No: {c.certificateNo}
                      {typeof c.scorePct === "number" ? ` · Score: ${c.scorePct}%` : ""}
                    </div>
                    <SimpleCertificate
                      recipient={fullName || "Learner"}
                      course={c.courseTitle}
                      date={c.issuedAt}
                      certId={c.certificateNo}
                      qrValue={c.verifyUrl}
                      qrProvider="quickchart"
                    />
                    <div className="flex flex-wrap gap-2 justify-end">
                      {c.courseSlug && (
                        <Link
                          href={`/courses/${c.courseSlug}/dashboard`}
                          className="text-xs rounded-md px-3 py-1.5 bg-[color:var(--color-light)]"
                        >
                          View course
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          downloadCertPdf({
                            certNumber: c.certificateNo,
                            recipient: fullName || "Learner",
                            courseTitle: c.courseTitle,
                            issuedAt: c.issuedAt,
                            verifyUrl: c.verifyUrl,
                            cpdPoints: c.cpdPoints,
                            scorePct: c.scorePct,
                          })
                        }
                        className="text-xs rounded-md px-3 py-1.5 text-white"
                        style={{ backgroundColor: PANABLUE }}
                      >
                        Download certificate
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {provisionalCerts.map((p) => (
                <div key={`prov-${p.courseId}`} className="rounded-xl border border-dashed border-light bg-white overflow-hidden">
                  <div className="relative w-full h-24">
                    <Image
                      src={p.courseImg || "/project-management.png"}
                      alt={p.courseTitle}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 50vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-black/5" />
                    <div className="absolute bottom-2 left-3 text-white font-semibold text-sm">
                      {p.courseTitle} (Provisional)
                    </div>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="text-xs text-muted">
                      Provisional (awaiting issuance) · Passed on {new Date(p.issuedAt).toLocaleDateString()}
                      {typeof p.scorePct === "number" ? ` · Score: ${p.scorePct}%` : ""}
                    </div>
                    <SimpleCertificate
                      recipient={fullName || "Learner"}
                      course={p.courseTitle}
                      date={p.issuedAt}
                      certId={p.certificateNo}
                      qrProvider="none"
                      showPrint
                    />
                    {p.courseSlug && (
                      <div className="flex justify-end">
                        <Link
                          href={`/courses/${p.courseSlug}/dashboard`}
                          className="text-xs rounded-md px-3 py-1.5 bg-[color:var(--color-light)]"
                        >
                          View course
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
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
