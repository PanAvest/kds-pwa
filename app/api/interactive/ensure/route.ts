import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { course_id?: string };
    const courseId = body?.course_id;
    if (!courseId) return NextResponse.json({ error: "course_id required" }, { status: 400 });

    const admin = getSupabaseAdmin();

    // Only allow interactive courses
    const { data: course, error: courseErr } = await admin
      .from("courses")
      .select("id,delivery_mode")
      .eq("id", courseId)
      .maybeSingle();
    if (courseErr) return NextResponse.json({ error: courseErr.message }, { status: 500 });
    if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });
    if (course.delivery_mode !== "interactive") {
      return NextResponse.json({ error: "Course is not interactive" }, { status: 400 });
    }

    // Chapter
    let chapterId: string | null = null;
    const { data: chapterRows, error: chErr } = await admin
      .from("course_chapters")
      .select("id")
      .eq("course_id", courseId)
      .order("order_index", { ascending: true })
      .limit(1);
    if (chErr) return NextResponse.json({ error: chErr.message }, { status: 500 });
    if (chapterRows && chapterRows[0]) {
      chapterId = chapterRows[0].id;
    } else {
      const { data: chIns, error: chInsErr } = await admin
        .from("course_chapters")
        .insert({
          course_id: courseId,
          title: "Interactive Module",
          order_index: 1,
          intro_video_url: null,
        })
        .select("id")
        .single();
      if (chInsErr) return NextResponse.json({ error: chInsErr.message }, { status: 500 });
      chapterId = chIns?.id ?? null;
    }

    if (!chapterId) return NextResponse.json({ error: "Could not ensure chapter" }, { status: 500 });

    // Slide
    let slideId: string | null = null;
    const { data: slideRows, error: slErr } = await admin
      .from("course_slides")
      .select("id")
      .eq("chapter_id", chapterId)
      .order("order_index", { ascending: true })
      .limit(1);
    if (slErr) return NextResponse.json({ error: slErr.message }, { status: 500 });
    if (slideRows && slideRows[0]) {
      slideId = slideRows[0].id;
    } else {
      const { data: slIns, error: slInsErr } = await admin
        .from("course_slides")
        .insert({
          chapter_id: chapterId,
          title: "Launch Interactive Module",
          order_index: 1,
          intro_video_url: null,
          asset_url: null,
          body: "Open the interactive module above, then mark as completed.",
        })
        .select("id")
        .single();
      if (slInsErr) return NextResponse.json({ error: slInsErr.message }, { status: 500 });
      slideId = slIns?.id ?? null;
    }

    return NextResponse.json({ ok: true, course_id: courseId, chapter_id: chapterId, slide_id: slideId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Server error" }, { status: 500 });
  }
}
