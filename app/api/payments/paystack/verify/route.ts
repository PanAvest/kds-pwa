export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const reference = searchParams.get("reference");
    if (!reference) return NextResponse.json({ ok: false, error: "Missing reference" }, { status: 400 });

    const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      cache: "no-store",
    });
    const j = await res.json();

    if (!j?.status || j?.data?.status !== "success") {
      return NextResponse.json({ ok: false, error: "Not successful (yet)" }, { status: 400 });
    }

    const meta = j.data?.metadata || {};
    const supabase = getSupabaseAdmin();
    if (meta.kind === "course" && meta.user_id && meta.course_id) {
      await supabase
        .from("enrollments")
        .upsert(
          {
            user_id: meta.user_id,
            course_id: meta.course_id,
            paid: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,course_id" }
        );
    } else if (meta.kind === "ebook" && meta.user_id && meta.ebook_id) {
      await supabase
        .from("ebook_purchases")
        .upsert(
          {
            user_id: meta.user_id,
            ebook_id: meta.ebook_id,
            status: "paid",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,ebook_id" }
        );
    }

    return NextResponse.json({
      ok: true,
      reference,
      kind: meta.kind,
      slug: meta.slug,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
