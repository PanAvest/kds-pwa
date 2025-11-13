"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { ProgressBar } from "@/components/ProgressBar";

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
        const needCompute: string[] = [];

        if (enrData) {
          const rows = enrData as unknown as EnrollmentRow[];
          for (const r of rows) {
            const c = pickCourse(r.courses) || { id: "", slug: "", title: "", img: null, cpd_points: null };
            const pct = typeof r.progress_pct === "number" ? r.progress_pct : 0;
            if (r.progress_pct == null) needCompute.push(r.course_id);
            metaTmp[r.course_id] = { title: c.title, slug: c.slug, cpd_points: c.cpd_points ?? null, img: c.img ?? null };
            enrolledTmp.push({
              course_id: r.course_id,
              progress_pct: pct,
              title: c.title,
              slug: c.slug,
              img: c.img ?? null,
              cpd_points: c.cpd_points ?? null,
            });
          }
        }

        // Compute progress if needed
        if (needCompute.length > 0) {
          const { data: chRows } = await supabase
            .from("course_chapters")
            .select("id,course_id")
            .in("course_id", Array.from(new Set(needCompute)));
          const chaptersByCourse: Record<string, string[]> = {};
          (chRows ?? []).forEach((r: { id: string; course_id: string }) => {
            (chaptersByCourse[r.course_id] ||= []).push(r.id);
          });

          const allChapterIds = Object.values(chaptersByCourse).flat();
          const totalSlidesByCourse: Record<string, number> = {};
          if (allChapterIds.length > 0) {
            const { data: slRows } = await supabase.from("course_slides").select("id,chapter_id").in("chapter_id", allChapterIds);
            (slRows ?? []).forEach((s: { id: string; chapter_id: string }) => {
              const cid = Object.keys(chaptersByCourse).find((k) => (chaptersByCourse[k] || []).includes(s.chapter_id));
              if (cid) totalSlidesByCourse[cid] = (totalSlidesByCourse[cid] ?? 0) + 1;
            });
          }

          const { data: progRows } = await supabase
            .from("user_slide_progress")
            .select("course_id, slide_id")
            .eq("user_id", userId)
            .in("course_id", Array.from(new Set(needCompute)));

          const doneByCourse: Record<string, Set<string>> = {};
          (progRows ?? []).forEach((r: { course_id: string; slide_id: string }) => {
            (doneByCourse[r.course_id] ||= new Set<string>()).add(r.slide_id);
          });

          enrolledTmp = enrolledTmp.map((e) => {
            if (!needCompute.includes(e.course_id)) return e;
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
                      href={`/knowledge/${c.slug}/dashboard`}
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
                          href={`/knowledge/${meta.slug}/dashboard`}
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
