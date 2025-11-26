// app/courses/[slug]/dashboard/page.tsx
"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { flushSync } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { issueCertificateForCourse, IssueCertificateError } from "@/lib/client/issueCertificate";
import InteractivePlayer from "@/components/InteractivePlayer";

/* ------------------------------------------------------------------ */
/* Optional: if you already have "@/components/ProgressBar",           */
/* replace this inline component with:                                 */
/*   import ProgressBar from "@/components/ProgressBar";               */
/* ------------------------------------------------------------------ */
function ProgressBar({ value = 0 }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full rounded-full bg-[color:var(--color-light)]/60 overflow-hidden">
      <div
        className="h-full bg-[color:#0a1156] transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ========================= Types ========================= */
type Course = { id: string; slug: string; title: string; img: string | null; delivery_mode?: string | null; interactive_path?: string | null };
type Chapter = { id: string; title: string; order_index: number; intro_video_url: string | null };
type Slide = {
  id: string;
  chapter_id: string;
  title: string;
  order_index: number;
  intro_video_url: string | null;
  asset_url: string | null;
  body: string | null;
  // legacy fields (supported)
  video_url?: string | null;
  content?: string | null;
};
type QuizQuestion = {
  id: string;
  chapter_id: string;
  question: string;
  options: string[]; // json[]
  correct_index: number; // 0-based
};
type QuizSetting = {
  chapter_id: string;
  time_limit_seconds: number | null;
  num_questions: number | null;
};
type Exam = {
  id: string;
  course_id: string;
  title: string | null;
  pass_mark: number | null;
  time_limit_minutes: number | null;
   num_questions?: number | null;
};
type ExamQuestion = {
  id: string;
  exam_id: string;
  prompt: string;
  options: string[];
  correct_index: number;
};
type ChapterQuizScore = {
  chapterId: string;
  chapterTitle: string;
  scorePct: number | null;
  correctCount: number | null;
  totalCount: number | null;
  completedAt: string | null;
};
type InteractiveState = "not_started" | "in_progress" | "completed";

/* ========================= Utils ========================= */
function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function shuffleOptionsWithAnswer(options: string[], correctIndex: number) {
  const mapped = options.map((opt, idx) => ({ opt, idx }));
  const shuffled = shuffle(mapped);
  const newOptions = shuffled.map((s) => s.opt);
  const newIndex = Math.max(0, shuffled.findIndex((s) => s.idx === correctIndex));
  return { newOptions, newIndex: newIndex === -1 ? 0 : newIndex };
}
function secondsToClock(s: number) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, "0")}`;
}
const progressKey = (userId: string, courseId: string) => `pv.progress.${userId}.${courseId}`;
// Interactive modules (e.g. GhIE Business Ethics at /interactive/ghie-business-ethics/story_html5.html) are hosted on the main PanAvest site, so we resolve `interactive_path` via NEXT_PUBLIC_MAIN_SITE_ORIGIN and fall back to the current origin when it is unset.
const INTERACTIVE_HOST =
  process.env.NEXT_PUBLIC_MAIN_SITE_ORIGIN ||
  (typeof window !== "undefined" && window.location?.origin ? window.location.origin : "http://localhost:3000");

function resolveInteractiveUrl(path?: string | null) {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  try {
    return new URL(trimmed, INTERACTIVE_HOST).toString();
  } catch {
    return trimmed;
  }
}

/* ====================== Media Player ====================== */
function VideoPlayer({
  src,
  poster,
}: {
  src: string;
  poster?: string | null;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onLoadedMetadata = () => {
    try {
      if (!ref.current) return;
      if (ref.current.currentTime === 0) ref.current.currentTime = 0.001;
    } catch {}
  };
  return (
    <div className="w-full rounded-lg overflow-hidden">
      <div className="relative w-full aspect-video bg-black">
        {!error ? (
          <video
            ref={ref}
            className="absolute inset-0 h-full w-full object-contain"
            playsInline
            preload="metadata"
            controls
            controlsList="nodownload"
            crossOrigin="anonymous"
            muted={false}
            poster={poster ?? undefined}
            src={src}
            onLoadedMetadata={onLoadedMetadata}
            onError={() => setError("The video couldn't load here. Use the link below to open in a new tab.")}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="text-center text-xs md:text-sm text-white/90">{error}</div>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-2 text-xs">
          <a href={src} target="_blank" rel="noreferrer" className="underline break-all">
            Open the video in a new tab
          </a>
        </div>
      )}
    </div>
  );
}

/* ====================== Main Component ====================== */
export default function CourseDashboard() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  /* Auth & user */
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState<string>("");

  /* Data state */
  const [course, setCourse] = useState<Course | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [completed, setCompleted] = useState<string[]>([]);
  const [activeSlide, setActiveSlide] = useState<Slide | null>(null);
  const [interactiveStatus, setInteractiveStatus] = useState<InteractiveState>("not_started");
  const [interactiveLastSeen, setInteractiveLastSeen] = useState<string | null>(null);

  /* Quiz/Exam state */
  const [quizByChapter, setQuizByChapter] = useState<Record<string, QuizQuestion[]>>({});
  const [quizSettings, setQuizSettings] = useState<Record<string, QuizSetting>>({});
  const [completedQuizzes, setCompletedQuizzes] = useState<string[]>([]);
  const [chapterScores, setChapterScores] = useState<ChapterQuizScore[]>([]);
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizChapterId, setQuizChapterId] = useState<string | null>(null);
  const [quizItems, setQuizItems] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number | null>>({});
  const [quizTimeLeft, setQuizTimeLeft] = useState<number>(0);
  const quizTickRef = useRef<number | null>(null);

  const [finalExam, setFinalExam] = useState<Exam | null>(null);
  const [finalExamQuestions, setFinalExamQuestions] = useState<ExamQuestion[]>([]);
  const [activeExamQuestions, setActiveExamQuestions] = useState<ExamQuestion[]>([]);
  const [finalExamOpen, setFinalExamOpen] = useState(false);
  const [finalAnswers, setFinalAnswers] = useState<Record<string, number | null>>({});
  const [finalTimeLeft, setFinalTimeLeft] = useState<number>(0);
  const finalTickRef = useRef<number | null>(null);
  const [finalAttemptExists, setFinalAttemptExists] = useState<boolean>(false);

  /* UI state */
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string>("");
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [chaptersOpen, setChaptersOpen] = useState(false); // slide-over
  const [certificateNotice, setCertificateNotice] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const initializedRef = useRef(false);
  const isInteractive = course?.delivery_mode === "interactive";
  const slideHtml = useMemo(() => activeSlide?.body ?? activeSlide?.content ?? "", [activeSlide?.body, activeSlide?.content]);
  const interactiveUrl = useMemo(() => resolveInteractiveUrl(course?.interactive_path ?? null), [course?.interactive_path]);

  /* ========= Auth ========= */
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/sign-in"); return; }
      setUserId(user.id);
      setUserEmail(user.email ?? "");
    })();
  }, [router]);

  /* ========= Load data ========= */
  useEffect(() => {
    if (!userId || !slug) return;
    (async () => {
      setLoading(true);

      // course
      const { data: c } = await supabase
        .from("courses")
        .select("id,slug,title,img,delivery_mode,interactive_path")
        .eq("slug", String(slug))
        .maybeSingle<Course>();
      if (!c) { router.push("/courses"); return; }
      setCourse(c);

      // paywall: enrollment must be paid
      const { data: enr, error: enrErr } = await supabase
        .from("enrollments")
        .select("paid")
        .eq("user_id", userId)
        .eq("course_id", c.id)
        .maybeSingle<{ paid: boolean | null }>();
      if (enrErr || !enr || enr.paid !== true) {
        router.replace(`/knowledge/${c.slug}/enroll`);
        return;
      }

      if (c.delivery_mode === "interactive") {
        try {
          await fetch("/api/interactive/ensure", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ course_id: c.id }),
          });
          const nowIso = new Date().toISOString();
          const { data: istate } = await supabase
            .from("user_interactive_state")
            .select("status,last_seen_at")
            .eq("user_id", userId)
            .eq("course_id", c.id)
            .maybeSingle();
          const nextStatus = istate?.status === "completed" ? "completed" : "in_progress";
          const { data: upData } = await supabase
            .from("user_interactive_state")
            .upsert(
              {
                user_id: userId,
                course_id: c.id,
                status: nextStatus,
                last_seen_at: nowIso,
              },
              { onConflict: "user_id,course_id" }
            )
            .select("status,last_seen_at")
            .maybeSingle();
          const resolvedState = (upData?.status ?? nextStatus) as InteractiveState;
          setInteractiveStatus(resolvedState);
          setInteractiveLastSeen(upData?.last_seen_at ?? istate?.last_seen_at ?? nowIso);
        } catch {
          /* non-blocking */
        }
      }

      // chapters
      const { data: ch } = await supabase
        .from("course_chapters")
        .select("id,title,order_index,intro_video_url")
        .eq("course_id", c.id)
        .order("order_index", { ascending: true }) as unknown as { data: Chapter[] };
      const chaptersData = (ch ?? []) as Chapter[];
      setChapters(chaptersData);
      const chapterIds = chaptersData.map(x => x.id);

      // slides
      let sl: Slide[] = [];
      if (chapterIds.length > 0) {
        const { data: slData } = await supabase
          .from("course_slides")
          .select("id,chapter_id,title,order_index,intro_video_url,asset_url,body,video_url,content")
          .in("chapter_id", chapterIds)
          .order("order_index", { ascending: true }) as unknown as { data: Slide[] };
        sl = (slData ?? []) as Slide[];
      }

      // sort by chapter.order_index then slide.order_index
      const chOrder: Record<string, number> = {};
      chaptersData.forEach(chp => { chOrder[chp.id] = chp.order_index ?? 0; });
      const slSorted = [...sl].sort((a, b) => {
        const ca = chOrder[a.chapter_id] ?? 0;
        const cb = chOrder[b.chapter_id] ?? 0;
        if (ca !== cb) return ca - cb;
        return (a.order_index ?? 0) - (b.order_index ?? 0);
      });
      setSlides(slSorted);
      if (!initializedRef.current) {
        setActiveSlide(slSorted[0] ?? null);
        initializedRef.current = true;
      }

      // progress merge (server + local)
      try {
        const { data: prog, error: progErr } = await supabase
          .from("user_slide_progress")
          .select("slide_id")
          .eq("user_id", userId)
          .eq("course_id", c.id) as unknown as { data: { slide_id: string }[]; error: unknown };
        if (progErr) {
          const fromLocal = JSON.parse(localStorage.getItem(progressKey(userId, c.id)) ?? "[]") as string[];
          setCompleted(fromLocal);
        } else {
          const fromServer = (prog ?? []).map(p => p.slide_id);
          const fromLocal = JSON.parse(localStorage.getItem(progressKey(userId, c.id)) ?? "[]") as string[];
          const merged = Array.from(new Set([...fromServer, ...fromLocal]));
          setCompleted(merged);
          localStorage.setItem(progressKey(userId, c.id), JSON.stringify(merged));
        }
      } catch {
        const fromLocal = JSON.parse(localStorage.getItem(progressKey(userId, c.id)) ?? "[]") as string[];
        setCompleted(fromLocal);
      }

      // chapter quiz questions
      try {
        if (chapterIds.length > 0) {
          const { data: qq } = await supabase
            .from("chapter_quiz_questions")
            .select("id,chapter_id,question,options,correct_index")
            .in("chapter_id", chapterIds) as unknown as { data: QuizQuestion[] };
          const map: Record<string, QuizQuestion[]> = {};
          (qq ?? []).forEach((q) => {
            const options = Array.isArray(q.options) ? q.options : [];
            (map[q.chapter_id] ||= []).push({ ...q, options });
          });
          setQuizByChapter(map);
        }
      } catch {}

      // quiz settings
      try {
        if (chapterIds.length > 0) {
          const { data: qs } = await supabase
            .from("chapter_quiz_settings")
            .select("chapter_id,time_limit_seconds,num_questions")
            .in("chapter_id", chapterIds) as unknown as { data: QuizSetting[] };
          const map: Record<string, QuizSetting> = {};
          (qs ?? []).forEach((s) => { map[s.chapter_id] = s; });
          setQuizSettings(map);
        }
      } catch {}

      // quiz progress + scores
      try {
        const { data: qprog } = await supabase
          .from("user_chapter_quiz")
          .select("chapter_id, score_pct, total_count, correct_count, completed_at")
          .eq("user_id", userId)
          .eq("course_id", c.id)
          .order("completed_at", { ascending: false }) as unknown as {
            data: { chapter_id: string; score_pct: number | null; total_count: number | null; correct_count: number | null; completed_at: string | null; }[];
          };
        const latestByChapter: Record<string, { score_pct: number | null; total_count: number | null; correct_count: number | null; completed_at: string | null; }> = {};
        const completedSet = new Set<string>();
        (qprog ?? []).forEach(r => {
          if (!latestByChapter[r.chapter_id]) {
            latestByChapter[r.chapter_id] = {
              score_pct: r.score_pct ?? null,
              total_count: r.total_count ?? null,
              correct_count: r.correct_count ?? null,
              completed_at: r.completed_at ?? null,
            };
          }
          completedSet.add(r.chapter_id);
        });
        setCompletedQuizzes(Array.from(completedSet));
        const rows: ChapterQuizScore[] = Object.entries(latestByChapter).map(([chapterId, v]) => ({
          chapterId,
          chapterTitle: (chaptersData ?? []).find(cc => cc.id === chapterId)?.title ?? "Chapter",
          scorePct: v.score_pct,
          totalCount: v.total_count,
          correctCount: v.correct_count,
          completedAt: v.completed_at,
        }));
        setChapterScores(rows);
      } catch {}

      // final exam + questions + attempt
      try {
        const { data: ex } = await supabase
          .from("exams")
          .select("id,course_id,title,pass_mark,time_limit_minutes,num_questions")
          .eq("course_id", c.id)
          .limit(1)
          .maybeSingle<Exam>();
        if (ex) {
          setFinalExam(ex);
          const { data: atts } = await supabase
            .from("attempts")
            .select("id")
            .eq("user_id", userId)
            .eq("exam_id", ex.id)
            .limit(1) as unknown as { data: { id: string }[] };
          setFinalAttemptExists((atts ?? []).length > 0);
          const { data: qs2 } = await supabase
            .from("questions")
            .select("id,exam_id,prompt,options,correct_index")
            .eq("exam_id", ex.id) as unknown as { data: ExamQuestion[] };
          const normalized = (qs2 ?? []).map(q => ({ ...q, options: Array.isArray(q.options) ? q.options : [] }));
          setFinalExamQuestions(normalized);
          setActiveExamQuestions([]);
          setFinalAnswers({});
        } else {
          setFinalExam(null);
          setFinalExamQuestions([]);
          setActiveExamQuestions([]);
          setFinalAttemptExists(false);
        }
      } catch {}

      setLoading(false);
    })();
  }, [userId, slug, router]);

  /* ========= Derived orders & gating ========= */
  const orderedSlides = useMemo(() => slides, [slides]);
  const orderedIds = useMemo(() => orderedSlides.map(s => s.id), [orderedSlides]);

  const slidesByChapter = useMemo(() => {
    const map: Record<string, Slide[]> = {};
    for (const s of orderedSlides) (map[s.chapter_id] ||= []).push(s);
    return map;
  }, [orderedSlides]);

  const chapterOrder = useMemo(() => {
    return [...chapters].sort((a,b)=> (a.order_index??0)-(b.order_index??0)).map(c=>c.id);
  }, [chapters]);

  const chapterLastSlideIndex: Record<string, number> = useMemo(() => {
    const idx: Record<string, number> = {};
    orderedSlides.forEach((s, i) => { idx[s.chapter_id] = i; });
    return idx;
  }, [orderedSlides]);

  const firstIncompleteIndex = useMemo(() => {
    for (let i = 0; i < orderedIds.length; i++) {
      if (!completed.includes(orderedIds[i])) return i;
    }
    return Math.max(0, orderedIds.length - 1);
  }, [orderedIds, completed]);

  const boundaryLockedIndex = useMemo(() => {
    for (let i = 0; i < chapterOrder.length; i++) {
      const chId = chapterOrder[i];
      const slidesInCh = slidesByChapter[chId] ?? [];
      if (slidesInCh.length === 0) continue;
      const allDone = slidesInCh.every(s => completed.includes(s.id));
      const quizDone = completedQuizzes.includes(chId);
      if (allDone && !quizDone) return chapterLastSlideIndex[chId] ?? firstIncompleteIndex;
    }
    return Math.max(0, orderedIds.length - 1);
  }, [chapterOrder, slidesByChapter, completed, completedQuizzes, chapterLastSlideIndex, orderedIds.length, firstIncompleteIndex]);

  const maxAccessibleIndex = Math.min(firstIncompleteIndex, boundaryLockedIndex);
  const canAccessById = useCallback((slideId: string) => {
    const idx = orderedIds.indexOf(slideId);
    if (idx === -1) return false;
    return idx <= maxAccessibleIndex;
  }, [orderedIds, maxAccessibleIndex]);

  const totalSlides = orderedSlides.length;
  const done = completed.length;
  const pct = totalSlides === 0 ? 0 : Math.round((done / totalSlides) * 100);

  /* ========= Connectivity ========= */
  useEffect(() => {
    const onlineHandler = () => setIsOnline(true);
    const offlineHandler = () => setIsOnline(false);
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    setIsOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
    };
  }, []);

  /* ========= Mark done ========= */
  async function markDone(slide: Slide | null) {
    if (!slide || !userId || !course) return;
    try {
      const { error } = await supabase
        .from("user_slide_progress")
        .upsert(
          {
            user_id: userId,
            course_id: course.id,
            slide_id: slide.id,
            completed_at: new Date().toISOString(),
          },
          { onConflict: "user_id,course_id,slide_id" }
        )
        .select("slide_id")
        .single();
      if (error) {
        setNotice(`Could not save progress: ${error.message}`);
        setTimeout(() => setNotice(""), 2200);
        return;
      }
      flushSync(() => {
        setCompleted(prev => (prev.includes(slide.id) ? prev : [...prev, slide.id]));
      });
      const key = progressKey(userId, course.id);
      const existing = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
      const merged = Array.from(new Set([...existing, slide.id]));
      localStorage.setItem(key, JSON.stringify(merged));
      setNotice("Marked as done ✓");
      const idx = orderedIds.indexOf(slide.id);
      if (idx > -1 && idx + 1 < orderedIds.length) {
        const next = orderedSlides[idx + 1];
        if (canAccessById(next.id)) {
          setActiveSlide(next);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }
      setTimeout(() => setNotice(""), 1400);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setNotice(`Save failed. ${msg}`.trim());
      setTimeout(() => setNotice(""), 2200);
    }
  }

  async function completeInteractiveModule() {
    if (!activeSlide) return;
    await markDone(activeSlide);
    if (course && userId) {
      const nowIso = new Date().toISOString();
      try {
        await supabase
          .from("user_interactive_state")
          .upsert(
            {
              user_id: userId,
              course_id: course.id,
              status: "completed",
              last_seen_at: nowIso,
            },
            { onConflict: "user_id,course_id" }
          );
        setInteractiveStatus("completed");
        setInteractiveLastSeen(nowIso);
      } catch {
        /* non-blocking */
      }
    }
  }

  /* ========= Chapter quiz ========= */
  const [quizTickOn, setQuizTickOn] = useState(false);
  function beginQuiz(chId: string) {
    const pool = quizByChapter[chId] ?? [];
    if (pool.length === 0) {
      setNotice("No quiz is set for this chapter yet.");
      setTimeout(() => setNotice(""), 1500);
      return;
    }
    const settings = quizSettings[chId];
    const num = Math.max(1, Math.min(pool.length, Number(settings?.num_questions ?? pool.length)));
    const randomized = shuffle(pool).slice(0, num);
    const answers: Record<string, number | null> = {};
    randomized.forEach(q => { answers[q.id] = null; });

    setQuizChapterId(chId);
    setQuizItems(randomized);
    setQuizAnswers(answers);
    setQuizTimeLeft(Math.max(10, Number(settings?.time_limit_seconds ?? 120)));
    setQuizOpen(true);
    setQuizTickOn(true);
  }
  useEffect(() => {
    if (!quizOpen || !quizTickOn) return;
    if (quizTickRef.current) window.clearInterval(quizTickRef.current);
    quizTickRef.current = window.setInterval(() => {
      setQuizTimeLeft(t => {
        if (t <= 1) {
          window.clearInterval(quizTickRef.current!);
          quizTickRef.current = null;
          void submitQuiz(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000) as unknown as number;
    return () => {
      if (quizTickRef.current) {
        window.clearInterval(quizTickRef.current);
        quizTickRef.current = null;
      }
    };
  }, [quizOpen, quizTickOn]);

  async function submitQuiz(auto = false) {
    if (!quizOpen || !quizChapterId || !course || !userId) return;
    const answered = quizItems.map(q => ({
      id: q.id,
      chosen: quizAnswers[q.id],
      correct: q.correct_index,
    }));
    const total = quizItems.length;
    const correctCount = answered.reduce((acc, a) => acc + (a.chosen === a.correct ? 1 : 0), 0);
    const scorePct = Math.round((correctCount / Math.max(1, total)) * 100);

    try {
      await supabase.from("user_chapter_quiz").insert({
        user_id: userId,
        course_id: course.id,
        chapter_id: quizChapterId,
        total_count: total,
        correct_count: correctCount,
        score_pct: scorePct,
        completed_at: new Date().toISOString(),
        meta: { autoSubmit: auto } as Record<string, unknown>,
      });
      setCompletedQuizzes(prev => (prev.includes(quizChapterId) ? prev : [...prev, quizChapterId]));
      setChapterScores(prev => {
        const title = chapters.find(ch => ch.id === quizChapterId)?.title ?? "Chapter";
        const row: ChapterQuizScore = {
          chapterId: quizChapterId!,
          chapterTitle: title,
          scorePct,
          totalCount: total,
          correctCount,
          completedAt: new Date().toISOString(),
        };
        const existing = prev.find(p => p.chapterId === quizChapterId);
        if (!existing) return [...prev, row];
        return prev.map(p => (p.chapterId === quizChapterId ? row : p));
      });
    } catch {}
    setQuizOpen(false);
    setQuizTickOn(false);
    setQuizChapterId(null);
    setQuizItems([]);
    setQuizAnswers({});
    setQuizTimeLeft(0);
    setNotice(`Quiz submitted. Score: ${correctCount}/${total} (${scorePct}%).`);
    setTimeout(() => setNotice(""), 2500);
  }

  /* ========= Final exam ========= */
  const allSlidesDone = useMemo(() => {
    if (orderedIds.length === 0) return false;
    return orderedIds.every(id => completed.includes(id));
  }, [orderedIds, completed]);

  const allChapterQuizzesDone = useMemo(() => {
    return chapters.every(ch => {
      const hasQuiz = (quizByChapter[ch.id]?.length ?? 0) > 0;
      return !hasQuiz || completedQuizzes.includes(ch.id);
    });
  }, [chapters, quizByChapter, completedQuizzes]);

  const canTakeFinal = allSlidesDone && allChapterQuizzesDone && !!finalExam && !!finalExamQuestions.length;

  function openFinalConfirm() {
    setCertificateNotice(null);
    if (!finalExam || finalExamQuestions.length === 0) {
      setNotice("Final exam is not set yet.");
      setTimeout(() => setNotice(""), 1800);
      return;
    }
    if (!canTakeFinal) {
      setNotice("Complete all slides and chapter quizzes first.");
      setTimeout(() => setNotice(""), 1800);
      return;
    }
    if (finalAttemptExists) {
      setNotice("You have already taken the final exam. Contact admin to pay the penalty to unlock a retry.");
      setTimeout(() => setNotice(""), 2500);
      return;
    }
    setFinalConfirmChecked(false);
    setFinalConfirmOpen(true);
  }

  // simple confirm modal (no external deps)
  const [finalConfirmOpen, setFinalConfirmOpen] = useState(false);
  const [finalConfirmChecked, setFinalConfirmChecked] = useState(false);

  function beginFinalExam() {
    if (!navigator.onLine) {
      setNotice("You are offline. Reconnect before starting.");
      setTimeout(() => setNotice(""), 2000);
      return;
    }
    const randomized = shuffle(finalExamQuestions);
    const limitRaw = Number(finalExam?.num_questions ?? 50);
    const limit = Math.max(1, Math.min(randomized.length, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : randomized.length));
    const selected = randomized.slice(0, limit).map((q) => {
      const { newOptions, newIndex } = shuffleOptionsWithAnswer(q.options, q.correct_index);
      return { ...q, options: newOptions, correct_index: newIndex };
    });
    if (selected.length === 0) {
      setNotice("Final exam does not have any questions yet.");
      setTimeout(() => setNotice(""), 1800);
      return;
    }
    const answers: Record<string, number | null> = {};
    selected.forEach(q => { answers[q.id] = null; });
    setActiveExamQuestions(selected);
    setFinalAnswers(answers);
    const limitMinutes = Math.max(1, Number(finalExam?.time_limit_minutes ?? 60));
    setFinalTimeLeft(limitMinutes * 60);
    setFinalExamOpen(true);
    setFinalConfirmOpen(false);
  }

  // guards
  const guardsBound = useRef(false);
  function bindGuards(enable: boolean) {
    if (enable && !guardsBound.current) {
      guardsBound.current = true;
      const onCopy = (e: ClipboardEvent) => e.preventDefault();
      const onContext = (e: MouseEvent) => e.preventDefault();
      const onKey = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && ["c","x","p","s","u"].includes(e.key.toLowerCase())) e.preventDefault();
        if (e.key === "PrintScreen") e.preventDefault();
      };
      const onBeforeUnload = (e: BeforeUnloadEvent) => {
        void submitFinalExam(true);
        e.preventDefault();
        e.returnValue = "";
      };
      const onVisibility = () => {
        if (document.visibilityState === "hidden") void submitFinalExam(true);
      };
      document.addEventListener("copy", onCopy);
      document.addEventListener("contextmenu", onContext);
      document.addEventListener("keydown", onKey);
      window.addEventListener("beforeunload", onBeforeUnload);
      document.addEventListener("visibilitychange", onVisibility);
      (window as any).__pv_exam_guards__ = { onCopy, onContext, onKey, onBeforeUnload, onVisibility };
    }
    if (!enable && guardsBound.current) {
      guardsBound.current = false;
      const g = (window as any).__pv_exam_guards__;
      if (g) {
        document.removeEventListener("copy", g.onCopy);
        document.removeEventListener("contextmenu", g.onContext);
        document.removeEventListener("keydown", g.onKey);
        window.removeEventListener("beforeunload", g.onBeforeUnload);
        document.removeEventListener("visibilitychange", g.onVisibility);
        (window as any).__pv_exam_guards__ = undefined;
      }
    }
  }

  useEffect(() => {
    if (!finalExamOpen) return;
    bindGuards(true);
    if (finalTickRef.current) window.clearInterval(finalTickRef.current);
    finalTickRef.current = window.setInterval(() => {
      setFinalTimeLeft(t => {
        if (t <= 1) {
          window.clearInterval(finalTickRef.current!);
          finalTickRef.current = null;
          void submitFinalExam(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000) as unknown as number;
    return () => {
      if (finalTickRef.current) {
        window.clearInterval(finalTickRef.current);
        finalTickRef.current = null;
      }
      bindGuards(false);
    };
  }, [finalExamOpen]);

  async function submitFinalExam(auto = false) {
    if (!finalExamOpen || !finalExam || !userId) return;
    setCertificateNotice(null);
    const questionSet = activeExamQuestions.length > 0 ? activeExamQuestions : finalExamQuestions;
    if (questionSet.length === 0) {
      setNotice("Final exam questions not found.");
      setTimeout(() => setNotice(""), 1800);
      return;
    }
    const answered = questionSet.map(q => ({
      id: q.id,
      chosen: finalAnswers[q.id],
      correct: q.correct_index,
    }));
    const total = questionSet.length;
    const correctCount = answered.reduce((acc, a) => acc + (a.chosen === a.correct ? 1 : 0), 0);
    const scorePct = Math.round((correctCount / Math.max(1, total)) * 100);
    const passMark = Number(finalExam.pass_mark ?? 0);
    const passed = scorePct >= passMark;

    setFinalExamOpen(false);
    setFinalTimeLeft(0);
    setActiveExamQuestions([]);
    setFinalAnswers({});
    setFinalResult({ scorePct, correct: correctCount, total, passed });
    if (passed) {
      try {
        setCertificateNotice({ type: "info", message: "Issuing your certificate…" });
        await issueCertificateForCourse({
          courseId: finalExam.course_id,
          examId: finalExam.id,
          score: scorePct,
          total,
          correctCount,
          autoSubmit: auto,
        });
        setFinalAttemptExists(true);
        setCertificateNotice({ type: "success", message: "Certificate issued! Visit your Dashboard to download it." });
      } catch (err) {
        const code = err instanceof IssueCertificateError ? err.code : (err as { code?: string } | null)?.code ?? null;
        if (code === "NOT_AUTHENTICATED") {
          setCertificateNotice({ type: "error", message: "Please sign in again before issuing your certificate." });
        } else if (code === "MISSING_FULL_NAME") {
          setCertificateNotice({ type: "error", message: "Add your full name on the Dashboard before we can issue your certificate." });
        } else {
          console.error("certificate issue failed", err);
          setCertificateNotice({ type: "error", message: "We could not issue your certificate right now. Please try again or contact support." });
        }
      }
    } else {
      try {
        await supabase.from("attempts").insert({
          user_id: userId,
          exam_id: finalExam.id,
          score: scorePct,
          passed: false,
          created_at: new Date().toISOString(),
          meta: { autoSubmit: auto, total, correctCount } as Record<string, unknown>,
        });
      } catch {}
    }
    setResultOpen(true);
  }

  /* ========= Navigation helpers ========= */
  const trySelectSlide = (s: Slide) => {
    if (canAccessById(s.id)) {
      setActiveSlide(s);
      setChaptersOpen(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setNotice("Complete the previous slide or chapter quiz first.");
      setTimeout(() => setNotice(""), 1500);
    }
  };
  const activeIndex = activeSlide ? orderedIds.indexOf(activeSlide.id) : -1;
  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex > -1 && (activeIndex + 1) <= maxAccessibleIndex;
  const isLastSlideOfChapter = useMemo(() => {
    if (!activeSlide) return false;
    const lastIdx = chapterLastSlideIndex[activeSlide.chapter_id];
    return typeof lastIdx === "number" && activeIndex === lastIdx;
  }, [activeSlide, chapterLastSlideIndex, activeIndex]);
  const quizExistsForActiveChapter = useMemo(() => {
    if (!activeSlide) return false;
    const pool = quizByChapter[activeSlide.chapter_id] ?? [];
    return pool.length > 0;
  }, [quizByChapter, activeSlide]);
  const quizDoneForActiveChapter = useMemo(() => {
    if (!activeSlide) return false;
    return completedQuizzes.includes(activeSlide.chapter_id);
  }, [completedQuizzes, activeSlide]);

  /* ========= Results modal ========= */
  const [resultOpen, setResultOpen] = useState(false);
  const [finalResult, setFinalResult] = useState<{ scorePct: number; correct: number; total: number; passed: boolean } | null>(null);

  /* ========= Loading guards ========= */
  if (loading) return <div className="mx-auto max-w-screen-lg px-4 py-10">Loading…</div>;
  if (!course) return <div className="mx-auto max-w-screen-lg px-4 py-10">Not found.</div>;

  /* ============================ UI ============================ */
  return (
    <div className="mx-auto max-w-screen-2xl px-4 md:px-6 py-4">
      {/* Mobile Top Nav */}
      <div className="sticky top-0 z-30 mb-4 flex items-center justify-between gap-3 bg-white/95 backdrop-blur border-b border-[color:var(--color-light)] px-1 py-2 md:rounded-xl md:border md:px-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm"
            onClick={() => router.push("/courses")}
          >
            Back
          </button>
          <div className="font-semibold truncate max-w-[45vw] md:max-w-none">{course.title}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm md:hidden"
            onClick={() => setChaptersOpen(true)}
            aria-expanded={chaptersOpen}
            aria-controls="chapters-drawer"
            title="Show all chapters"
          >
            Chapters
          </button>
          <div className="hidden md:flex items-center gap-2 text-xs">
            {userEmail && <span className="truncate max-w-[28ch]">{userEmail}</span>}
          </div>
        </div>
      </div>

      {/* Exam CTA inline with header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {finalExam && finalExamQuestions.length > 0 && (
            <>
              {!canTakeFinal && !finalAttemptExists && (
                <span className="text-[11px] md:text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800">
                  Complete all slides & chapter quizzes to unlock Final Exam
                </span>
              )}
              {canTakeFinal && !finalAttemptExists && (
                <button
                  type="button"
                  onClick={openFinalConfirm}
                  className="rounded-lg bg-[color:#0a1156] text-white px-3 py-1.5 text-xs md:text-sm hover:opacity-90"
                  aria-label="Start Final Exam"
                >
                  Start Final Exam
                </button>
              )}
              {finalAttemptExists && (
                <span className="text-[11px] md:text-xs px-2 py-1 rounded-full bg-green-100 text-green-800">
                  Final Exam completed
                </span>
              )}
            </>
          )}
        </div>
        <div className="hidden md:flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-sm"
            onClick={() => setChaptersOpen(true)}
          >
            Show all chapters
          </button>
        </div>
      </div>

      {/* Pre-test checklist */}
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs md:text-sm">
        <div className="font-semibold mb-1">Before starting any test:</div>
        <ul className="list-disc pl-5 grid gap-1">
          <li>Use a stable internet connection. {isOnline ? "✅ Online" : "⚠️ Offline"}</li>
          <li>Close other heavy apps/tabs; avoid VPNs that drop.</li>
          <li>Once you start, you <b>cannot pause</b>. The timer runs continuously.</li>
          <li>Do not switch/close the tab — your test will automatically end.</li>
          <li>Copying/printing is disabled during the test.</li>
        </ul>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:block rounded-2xl bg-white border border-[color:var(--color-light)] p-4 h-max sticky top-24 max-h-[75vh] overflow-auto">
          <div className="text-sm">Progress</div>
          <div className="mt-1"><ProgressBar value={pct} /></div>
          <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">{done} / {totalSlides} slides completed</div>

          {isInteractive && (
            <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-2 text-[11px] text-blue-800">
              Interactive Storyline course. Launch it in the main area, then mark it as completed to unlock the exam.
            </div>
          )}

          <div className="mt-4">
            {chapters.map((ch) => (
              <div key={ch.id} className="mb-3">
                <div className="font-semibold text-sm flex items-center justify-between">
                  <span>{ch.title}</span>
                  {(quizByChapter[ch.id]?.length ?? 0) > 0 && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${completedQuizzes.includes(ch.id) ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                      {completedQuizzes.includes(ch.id) ? "Quiz done" : "Quiz"}
                    </span>
                  )}
                </div>
                <ul className="mt-2 grid gap-1">
                  {(slidesByChapter[ch.id] ?? []).map((s) => {
                    const isActive = activeSlide?.id === s.id;
                    const isDone = completed.includes(s.id);
                    const isLocked = !canAccessById(s.id);
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          disabled={isLocked}
                          className={[
                            "w-full text-left text-sm px-3 py-2 rounded-md",
                            isActive ? "bg-[color:var(--color-light)]" : "hover:bg-[color:var(--color-light)]/70",
                            isLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                          ].join(" ")}
                          onClick={() => trySelectSlide(s)}
                          aria-disabled={isLocked}
                        >
                          {isDone ? "✓ " : (isLocked ? "🔒 " : "")}{s.title}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {chapters.length === 0 && <div className="text-sm text-[color:var(--color-text-muted)]">No content yet.</div>}
          </div>
        </aside>

        {/* Main */}
        <main className="rounded-2xl bg-white border border-[color:var(--color-light)] p-4 pb-24 md:pb-6">
          {/* Small progress on top for mobile */}
          <div className="lg:hidden mb-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span>Progress</span><span>{pct}%</span>
            </div>
            <ProgressBar value={pct} />
            <div className="mt-1 text-[11px] text-[color:var(--color-text-muted)]">{done} / {totalSlides} slides</div>
          </div>

          {isInteractive ? (
            <div className="grid gap-3">
              <div className="text-base md:text-lg font-semibold">{course?.title}</div>
              <div className="text-xs text-[color:var(--color-text-muted)]">
                Status: {interactiveStatus === "completed" ? "Completed" : interactiveStatus === "in_progress" ? "In progress" : "Not started"}
                {interactiveLastSeen ? ` · Last seen ${new Date(interactiveLastSeen).toLocaleString()}` : ""}
              </div>

              {interactiveUrl ? (
                <InteractivePlayer src={interactiveUrl} title="Interactive course player" />
              ) : (
                <div className="text-sm text-red-700">Interactive entry path is not configured for this course.</div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => completeInteractiveModule()}
                  disabled={!activeSlide || completed.includes(activeSlide.id)}
                  className="rounded-xl bg-[color:#0a1156] text-white px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-60"
                >
                  {activeSlide && completed.includes(activeSlide.id) ? "Module marked completed" : "Mark interactive course as completed"}
                </button>
                {interactiveUrl && (
                  <a
                    href={interactiveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl px-5 py-2.5 ring-1 ring-[var(--color-light)] hover:bg-[color:var(--color-light)]/50"
                  >
                    Open in new tab
                  </a>
                )}
              </div>

              {!!notice && (
                <div role="status" aria-live="polite" className="mt-1 text-xs md:text-sm text-[#0a1156]">
                  {notice}
                </div>
              )}
            </div>
          ) : activeSlide ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="text-base md:text-lg font-semibold">{activeSlide.title}</div>
                <div className="hidden sm:flex gap-2">
                  <button
                    type="button"
                    onClick={() => { if (canGoPrev) setActiveSlide(orderedSlides[activeIndex - 1]); }}
                    disabled={!canGoPrev}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${canGoPrev ? "hover:bg-[color:var(--color-light)]/70" : "opacity-50 cursor-not-allowed"}`}
                    aria-label="Previous slide"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (canGoNext) setActiveSlide(orderedSlides[activeIndex + 1]);
                      else setNotice("Complete this slide or the chapter quiz first.");
                    }}
                    disabled={!canGoNext}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${canGoNext ? "hover:bg-[color:var(--color-light)]/70" : "opacity-50 cursor-not-allowed"}`}
                    aria-label="Next slide"
                  >
                    Next
                  </button>
                </div>
              </div>

              {/* Media */}
              {(() => {
                const video = activeSlide.video_url ?? activeSlide.intro_video_url ?? null;
                if (video) return <div className="mt-3"><VideoPlayer src={video} poster={null} /></div>;
                if (activeSlide.asset_url) {
                  const lower = activeSlide.asset_url.toLowerCase();
                  const isImg = [".jpg",".jpeg",".png",".gif",".webp"].some(ext => lower.endsWith(ext));
                  if (isImg) {
                    return (
                      <div className="mt-3">
                        <Image
                          src={activeSlide.asset_url}
                          alt="Slide asset"
                          width={1600}
                          height={900}
                          className="rounded-lg ring-1 ring-[var(--color-light)] w-full h-auto object-contain"
                        />
                      </div>
                    );
                  }
                  return (
                    <div className="mt-3 text-sm">
                      <a className="underline break-all" href={activeSlide.asset_url} target="_blank" rel="noreferrer">
                        Open slide asset
                      </a>
                    </div>
                  );
                }
                return null;
              })()}

              {slideHtml && (
                <div
                  className="prose prose-sm sm:prose max-w-none mt-4 text-[0.95rem] leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: slideHtml }}
                />
              )}

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => markDone(activeSlide)}
                  className="rounded-xl bg-[color:#0a1156] text-white px-5 py-2.5 font-semibold hover:opacity-90"
                >
                  Mark as Done
                </button>

                {isLastSlideOfChapter && completed.includes(activeSlide.id) && quizExistsForActiveChapter && !quizDoneForActiveChapter && (
                  <button
                    type="button"
                    onClick={() => beginQuiz(activeSlide.chapter_id)}
                    className="rounded-xl px-5 py-2.5 ring-1 ring-[var(--color-light)] hover:bg-[color:var(--color-light)]/50"
                  >
                    Take Chapter Quiz
                  </button>
                )}

                {isLastSlideOfChapter && quizExistsForActiveChapter && quizDoneForActiveChapter && (
                  <span className="inline-flex items-center text-xs px-2 py-1 rounded-lg bg-green-100 text-green-800">
                    Chapter quiz completed
                  </span>
                )}
              </div>

              {!!notice && (
                <div role="status" aria-live="polite" className="mt-3 text-xs md:text-sm text-[#0a1156]">
                  {notice}
                </div>
              )}
            </>
          ) : (
            <div className="text-[color:var(--color-text-muted)]">Select a slide to begin.</div>
          )}
        </main>
      </div>

      {/* Sticky Bottom Action Bar (mobile) */}
      {activeSlide && !isInteractive && (
        <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur border-t border-[color:var(--color-light)]">
          <div className="mx-auto max-w-screen-2xl px-4 py-2 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => { if (canGoPrev) setActiveSlide(orderedSlides[activeIndex - 1]); }}
              disabled={!canGoPrev}
              className={`rounded-lg border px-3 py-3 text-sm ${canGoPrev ? "active:scale-[0.98]" : "opacity-50 cursor-not-allowed"}`}
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => markDone(activeSlide)}
              className="rounded-lg bg-[color:#0a1156] text-white px-3 py-3 text-sm font-semibold active:scale-[0.98]"
            >
              Done
            </button>
            <button
              type="button"
              onClick={() => {
                if (canGoNext) setActiveSlide(orderedSlides[activeIndex + 1]);
                else setNotice("Complete this slide or the chapter quiz first.");
              }}
              disabled={!canGoNext}
              className={`rounded-lg border px-3 py-3 text-sm ${canGoNext ? "active:scale-[0.98]" : "opacity-50 cursor-not-allowed"}`}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Slide-over: Chapters (mobile + tablet + desktop “Show all chapters”) */}
      {chaptersOpen && (
        <div id="chapters-drawer" className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setChaptersOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full w-[86%] sm:w-[420px] bg-white shadow-xl border-l border-[color:var(--color-light)] p-4 overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">All Chapters</div>
              <button
                type="button"
                className="rounded-md border px-3 py-1.5 text-sm"
                onClick={() => setChaptersOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-3 text-xs">Progress</div>
            <div className="mt-1"><ProgressBar value={pct} /></div>
            <div className="mt-1 text-[11px] text-[color:var(--color-text-muted)]">{done} / {totalSlides} slides</div>

            <div className="mt-4">
              {chapters.map((ch) => (
                <div key={ch.id} className="mb-3">
                  <div className="font-semibold text-sm flex items-center justify-between">
                    <span>{ch.title}</span>
                    {(quizByChapter[ch.id]?.length ?? 0) > 0 && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${completedQuizzes.includes(ch.id) ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                        {completedQuizzes.includes(ch.id) ? "Quiz done" : "Quiz"}
                      </span>
                    )}
                  </div>
                  <ul className="mt-2 grid gap-1">
                    {(slidesByChapter[ch.id] ?? []).map((s) => {
                      const isActive = activeSlide?.id === s.id;
                      const isDone = completed.includes(s.id);
                      const isLocked = !canAccessById(s.id);
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            disabled={isLocked}
                            className={[
                              "w-full text-left text-sm px-3 py-2 rounded-md",
                              isActive ? "bg-[color:var(--color-light)]" : "hover:bg-[color:var(--color-light)]/70",
                              isLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                            ].join(" ")}
                            onClick={() => trySelectSlide(s)}
                            aria-disabled={isLocked}
                          >
                            {isDone ? "✓ " : (isLocked ? "🔒 " : "")}{s.title}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {(slidesByChapter[ch.id]?.length ?? 0) > 0 && (quizByChapter[ch.id]?.length ?? 0) > 0 && (
                    <div className="mt-2">
                      {completedQuizzes.includes(ch.id) ? (
                        <span className="text-[10px] px-2 py-1 rounded bg-green-100 text-green-800">Chapter quiz completed</span>
                      ) : (
                        <button
                          type="button"
                          className="text-[12px] underline"
                          onClick={() => beginQuiz(ch.id)}
                        >
                          Take chapter quiz
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {chapters.length === 0 && <div className="text-sm text-[color:var(--color-text-muted)]">No content yet.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Chapter Quiz Modal */}
      {quizOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setQuizOpen(false)} />
          <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white border border-[color:var(--color-light)] p-5 max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold">Chapter Quiz</div>
              <div className="text-sm font-medium">
                Time left:{" "}
                <span className={quizTimeLeft <= 10 ? "text-red-600" : ""}>
                  {secondsToClock(quizTimeLeft)}
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-4">
              {quizItems.map((q, idx) => (
                <div key={q.id} className="rounded-lg p-3 ring-1 ring-[var(--color-light)]">
                  <div className="font-medium text-sm">{idx + 1}. {q.question}</div>
                  <div className="mt-2 grid gap-2">
                    {q.options.map((opt, i) => {
                      const name = `q_${q.id}`;
                      const checked = quizAnswers[q.id] === i;
                      return (
                        <label key={i} className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={name}
                            checked={checked}
                            onChange={() => setQuizAnswers(a => ({ ...a, [q.id]: i }))}
                          />
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setQuizOpen(false)}
                className="rounded-lg px-4 py-2 ring-1 ring-[var(--color:var(--color-light))]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => submitQuiz(false)}
                className="rounded-lg bg-[color:#0a1156] text-white px-4 py-2 font-semibold hover:opacity-90"
              >
                Submit Quiz
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Final Exam Confirm */}
      {finalConfirmOpen && finalExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setFinalConfirmOpen(false)} />
          <div className="relative z-10 w-full max-w-xl rounded-2xl bg-white border border-[color:var(--color-light)] p-5 max-h-[88vh] overflow-auto">
            <div className="text-lg font-semibold">Before you start the Final Exam</div>
            <div className="mt-3 text-xs md:text-sm">
              <ul className="list-disc pl-5 grid gap-1">
                <li>Use a stable internet connection. Status: {isOnline ? "✅ Online" : "⚠️ Offline"}</li>
                <li>Close other heavy apps/tabs; avoid VPNs that may drop.</li>
                <li>Once you start, you <b>cannot pause</b>. The timer runs continuously.</li>
                <li>Do <b>not</b> close or switch the tab; the exam will auto-end.</li>
                <li>Copying/printing is disabled during the exam.</li>
                <li>One attempt only. To retry, pay the penalty via admin.</li>
              </ul>
              <div className="mt-3 text-xs text-[color:var(--color-text-muted)]">
                Time limit: <b>{finalExam.time_limit_minutes ?? 60} minutes</b> • Pass mark: <b>{finalExam.pass_mark ?? 0}%</b>
              </div>
              <label className="mt-4 flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={finalConfirmChecked}
                  onChange={(e) => setFinalConfirmChecked(e.target.checked)}
                />
                <span>
                  I understand that switching/closing the tab will auto-end the exam and copying is disabled.
                </span>
              </label>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setFinalConfirmOpen(false)}
                className="rounded-lg px-4 py-2 ring-1 ring-[var(--color:var(--color-light))]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!finalConfirmChecked || !isOnline}
                onClick={beginFinalExam}
                className={`rounded-lg px-4 py-2 font-semibold ${(!finalConfirmChecked || !isOnline) ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-[color:#0a1156] text-white hover:opacity-90"}`}
              >
                I Agree — Start Exam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Final Exam Modal */}
      {finalExamOpen && finalExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none">
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative z-10 w-full max-w-3xl rounded-2xl bg-white border border-[color:var(--color-light)] p-5 max-h-[92vh] overflow-auto">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold">{finalExam.title || "Final Exam"}</div>
              <div className="text-sm font-medium">
                Time left:{" "}
                <span className={finalTimeLeft <= 60 ? "text-red-600" : ""}>
                  {secondsToClock(finalTimeLeft)}
                </span>
              </div>
            </div>

            <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
              <ul className="list-disc pl-5 grid gap-1">
                <li>Timer cannot be paused.</li>
                <li>Do not close or switch this tab. Doing so will auto-end the exam.</li>
                <li>Copying/printing is disabled during the exam.</li>
                <li>One attempt only. To retry, pay the penalty via admin.</li>
              </ul>
            </div>

            {!isOnline && (
              <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
                You are offline. Stay online to ensure your answers are saved.
              </div>
            )}

            <div className="mt-4 grid gap-4">
              {(activeExamQuestions.length > 0 ? activeExamQuestions : finalExamQuestions).map((q, idx) => (
                <div key={q.id} className="rounded-lg p-3 ring-1 ring-[var(--color-light)]">
                  <div className="font-medium text-sm">{idx + 1}. {q.prompt}</div>
                  <div className="mt-2 grid gap-2">
                    {q.options.map((opt, i) => {
                      const name = `f_${q.id}`;
                      const checked = finalAnswers[q.id] === i;
                      return (
                        <label key={i} className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={name}
                            checked={checked}
                            onChange={() => setFinalAnswers(a => ({ ...a, [q.id]: i }))}
                          />
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => submitFinalExam(false)}
                className="rounded-lg bg-[color:#0a1156] text-white px-4 py-2 font-semibold hover:opacity-90"
              >
                Submit Final Exam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results Modal */}
      {resultOpen && finalResult && finalExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setResultOpen(false)} />
          <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white border border-[color:var(--color-light)] p-5 max-h-[92vh] overflow-auto">
            <div className="text-lg font-semibold">Results</div>

            <div className="mt-3 grid gap-2 text-sm">
              <div className="rounded-lg p-3 ring-1 ring-[var(--color-light)]">
                <div className="font-medium">Final Exam</div>
                <div className="mt-1">
                  Score: <b>{finalResult.correct}/{finalResult.total}</b> ({finalResult.scorePct}%)
                  {" · "}Pass mark: <b>{finalExam.pass_mark ?? 0}%</b>
                </div>
              <div className={`mt-1 inline-block px-2 py-0.5 rounded ${finalResult.passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                {finalResult.passed ? "PASSED" : "NOT PASSED"}
              </div>
            </div>

              {finalResult.passed && (
                <div
                  className={`rounded-lg p-3 text-sm ${
                    certificateNotice?.type === "error"
                      ? "bg-red-50 border border-red-200 text-red-800"
                      : certificateNotice?.type === "success"
                        ? "bg-green-50 border border-green-200 text-green-800"
                        : "bg-blue-50 border border-blue-200 text-blue-900"
                  }`}
                >
                  {certificateNotice?.message ?? "Visit your Dashboard to download your certificate."}
                  <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                    Need to edit the name on the certificate? Update it via the Dashboard before downloading.
                  </div>
                </div>
              )}

              <div className="rounded-lg p-3 ring-1 ring-[var(--color-light)]">
                <div className="font-medium mb-2">Chapter Quiz Scores</div>
                {chapterScores.length === 0 ? (
                  <div className="text-xs text-[color:var(--color-text-muted)]">No chapter quiz submissions found.</div>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full text-xs md:text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className="py-1 pr-2">Chapter</th>
                          <th className="py-1 pr-2">Score</th>
                          <th className="py-1 pr-2">Details</th>
                          <th className="py-1 pr-2">Completed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chapterScores.map((r) => (
                          <tr key={r.chapterId} className="border-t">
                            <td className="py-1 pr-2">{r.chapterTitle}</td>
                            <td className="py-1 pr-2">{r.scorePct ?? "—"}%</td>
                            <td className="py-1 pr-2">{r.correctCount ?? "—"}/{r.totalCount ?? "—"}</td>
                            <td className="py-1 pr-2">{r.completedAt ? new Date(r.completedAt).toLocaleString() : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setResultOpen(false)}
                className="rounded-lg px-4 py-2 ring-1 ring-[var(--color-light)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
