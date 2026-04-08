// File: app/api/payments/paystack/init/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createSignedPaystackMetadata,
  PAYSTACK_CURRENCY,
} from "@/lib/payments/paystack";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkRateLimit } from "@/lib/rateLimit";

type InitBody = {
  meta?: {
    kind?: "course" | "ebook";
    course_id?: string | null;
    ebook_id?: string | null;
    slug?: string | null;
  };
};

function supabaseForToken(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    }
  );
}

async function getAccessToken(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  const jar = await cookies();
  return jar.get("sb-access-token")?.value || "";
}

function resolveCallbackBase() {
  return (
    process.env.POST_PAY_REDIRECT_BASE ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.PUBLIC_WEB_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

function toMinorUnits(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric * 100);
}

export async function POST(req: Request) {
  try {
    const rateLimit = checkRateLimit(req, "api:paystack:init", {
      limit: 20,
      windowMs: 10 * 60 * 1000,
    });
    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: "Too many payment attempts. Please retry shortly." },
        {
          status: 429,
          headers: {
            ...rateLimit.headers,
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const body = (await req.json().catch(() => ({}))) as InitBody;
    const meta = body.meta;
    const kind = meta?.kind;

    if (kind !== "course" && kind !== "ebook") {
      return NextResponse.json({ error: "Unsupported payment kind." }, { status: 400 });
    }

    const accessToken = await getAccessToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const authSb = supabaseForToken(accessToken);
    const {
      data: { user },
      error: userError,
    } = await authSb.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }

    const email = user.email?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Authenticated account has no email." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const callbackBase = resolveCallbackBase();
    let amountMinor = 0;
    let callbackUrl = "";
    let signedMetadata;

    if (kind === "course") {
      const courseId = meta?.course_id?.trim();
      const slug = meta?.slug?.trim();
      if (!courseId && !slug) {
        return NextResponse.json({ error: "Course payment requires course_id or slug." }, { status: 400 });
      }

      let query = supabase
        .from("courses")
        .select("id, slug, price, published, free_for_logged_in")
        .eq("published", true);

      query = courseId ? query.eq("id", courseId) : query.eq("slug", slug!);
      const { data: course, error } = await query.maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!course) {
        return NextResponse.json({ error: "Course not found." }, { status: 404 });
      }
      if (course.free_for_logged_in === true) {
        return NextResponse.json({ error: "This course does not require payment." }, { status: 400 });
      }

      amountMinor = toMinorUnits(course.price);
      if (!amountMinor) {
        return NextResponse.json({ error: "Course price is not configured." }, { status: 400 });
      }

      callbackUrl = `${callbackBase}/courses/${course.slug}/enroll?verify=1`;
      signedMetadata = createSignedPaystackMetadata({
        kind: "course",
        user_id: user.id,
        course_id: course.id,
        slug: course.slug,
        amount_minor: amountMinor,
        currency: PAYSTACK_CURRENCY,
        email,
      });
    } else {
      const ebookId = meta?.ebook_id?.trim();
      const slug = meta?.slug?.trim();
      if (!ebookId && !slug) {
        return NextResponse.json({ error: "E-book payment requires ebook_id or slug." }, { status: 400 });
      }

      let query = supabase
        .from("ebooks")
        .select("id, slug, price_cents, published")
        .eq("published", true);

      query = ebookId ? query.eq("id", ebookId) : query.eq("slug", slug!);
      const { data: ebook, error } = await query.maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!ebook) {
        return NextResponse.json({ error: "E-book not found." }, { status: 404 });
      }

      amountMinor = Number(ebook.price_cents ?? 0);
      if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
        return NextResponse.json({ error: "E-book price is not configured." }, { status: 400 });
      }

      callbackUrl = `${callbackBase}/ebooks/${ebook.slug}?verify=1`;
      signedMetadata = createSignedPaystackMetadata({
        kind: "ebook",
        user_id: user.id,
        ebook_id: ebook.id,
        slug: ebook.slug,
        amount_minor: amountMinor,
        currency: PAYSTACK_CURRENCY,
        email,
      });
    }

    const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
    if (!secret) {
      return NextResponse.json({ error: "Missing PAYSTACK_SECRET_KEY." }, { status: 500 });
    }

    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amountMinor,
        currency: PAYSTACK_CURRENCY,
        callback_url: callbackUrl,
        metadata: signedMetadata,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const j = await res.json();
    if (!res.ok || !j?.status) {
      return NextResponse.json(
        { error: j?.message || "Init failed" },
        { status: res.ok ? 400 : 502 }
      );
    }

    return NextResponse.json({
      authorization_url: j.data.authorization_url,
      reference: j.data.reference,
    }, { headers: rateLimit.headers });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as Error).message || "Server error" },
      { status: 500 }
    );
  }
}
