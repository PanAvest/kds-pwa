import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const courseId = body?.course_id;
    if (!courseId)
      return NextResponse.json(
        { error: "course_id required" },
        { status: 400 }
      );

    const admin = getSupabaseAdmin();

    const { data: course } = await admin
      .from("courses")
      .select("id,delivery_mode")
      .eq("id", courseId)
      .maybeSingle();

    if (!course)
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    if (course.delivery_mode !== "interactive") {
      return NextResponse.json({ error: "Not interactive" }, { status: 400 });
    }

    // Ensure chapter
    let chapterId = null;
    const { data: ch } = await admin
      .from("course_chapters")
      .select("id")
      .eq("course_id", courseId)
      .order("order_index")
      .limit(1);

    if (ch?.[0]) chapterId = ch[0].id;
    else {
      const { data: ins } = await admin
        .from("course_chapters")
        .insert({
          course_id: courseId,
          title: "Interactive Module",
          order_index: 1,
        })
        .select("id")
        .single();
      chapterId = ins.id;
    }

    // Ensure slide
    const { data: sl } = await admin
      .from("course_slides")
      .select("id")
      .eq("chapter_id", chapterId)
      .order("order_index")
      .limit(1);

    let slideId = null;
    if (sl?.[0]) slideId = sl[0].id;
    else {
      const { data: ins } = await admin
        .from("course_slides")
        .insert({
          chapter_id: chapterId,
          title: "Launch Interactive Module",
          order_index: 1,
          body: "Open interactive module above.",
        })
        .select("id")
        .single();
      slideId = ins.id;
    }

    return NextResponse.json({
      ok: true,
      course_id: courseId,
      chapter_id: chapterId,
      slide_id: slideId,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
