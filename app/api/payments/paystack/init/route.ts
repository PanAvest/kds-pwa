// File: app/api/payments/paystack/init/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { email, amountMinor, meta } = await req.json();

    // Basic checks (support course + ebook)
    const isCourse = meta?.kind === "course" && meta?.course_id;
    const isEbook = meta?.kind === "ebook" && meta?.ebook_id;
    if (!email || !amountMinor || !meta?.user_id || (!isCourse && !isEbook)) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const secret = process.env.PAYSTACK_SECRET_KEY!;
    const base =
      process.env.POST_PAY_REDIRECT_BASE ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.PUBLIC_WEB_BASE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";
    const callback_url = isCourse
      ? `${base}/courses/${meta.slug}/enroll?verify=1`
      : `${base}/ebooks/${meta.slug}?verify=1`;

    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: Number(amountMinor), // already minor units
        callback_url,
        metadata: isCourse
          ? {
              kind: "course",
              user_id: meta.user_id,
              course_id: meta.course_id,
              slug: meta.slug,
            }
          : {
              kind: "ebook",
              user_id: meta.user_id,
              ebook_id: meta.ebook_id,
              slug: meta.slug,
            },
      }),
    });

    const j = await res.json();
    if (!j?.status) {
      return NextResponse.json({ error: j?.message || "Init failed" }, { status: 400 });
    }

    return NextResponse.json({
      authorization_url: j.data.authorization_url,
      reference: j.data.reference,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
