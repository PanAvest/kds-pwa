// app/api/ebooks/secure-pdf/route.ts (PWA)
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseForToken(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Missing Supabase env");
  }
  return createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ebookId = url.searchParams.get("ebookId");
  const debug = url.searchParams.get("debug") === "1";

  const respondDebug = (status: number, step: string, extra: Record<string, unknown> = {}) => {
    if (!debug) {
      return NextResponse.json({ error: step, ...extra }, { status });
    }
    return NextResponse.json({ step, ...extra }, { status });
  };

  try {
    if (!ebookId) {
      return respondDebug(400, "missing-ebookId");
    }

    // 1) Get access token from header or cookie
    const authHeader = req.headers.get("authorization") || "";
    let token = "";
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      token = authHeader.slice(7).trim();
    }
    if (!token) {
      const jar = await cookies();
      token = jar.get("sb-access-token")?.value || "";
    }
    if (!token) {
      return respondDebug(401, "no-token");
    }

    const sb = supabaseForToken(token);

    // 2) Identify user
    const { data: userInfo, error: userErr } = await sb.auth.getUser();
    if (userErr || !userInfo?.user) {
      console.error("secure-pdf userErr", userErr);
      return respondDebug(401, "user-fail", { message: userErr?.message ?? "Invalid session" });
    }
    const userId = userInfo.user.id;

    // 3) Load ebook
    const { data: ebook, error: ebookErr } = await sb
      .from("ebooks")
      .select("id, published, sample_url")
      .eq("id", ebookId)
      .maybeSingle();

    if (ebookErr) {
      console.error("secure-pdf ebookErr", ebookErr);
      return respondDebug(500, "ebook-fail", { message: ebookErr.message });
    }
    if (!ebook || ebook.published !== true) {
      return respondDebug(404, "ebook-not-found-or-unpublished");
    }

    // 4) Check purchase
    const { data: purchase, error: purchaseErr } = await sb
      .from("ebook_purchases")
      .select("status")
      .eq("user_id", userId)
      .eq("ebook_id", ebookId)
      .maybeSingle();

    if (purchaseErr) {
      console.error("secure-pdf purchaseErr", purchaseErr);
      return respondDebug(500, "purchase-fail", { message: purchaseErr.message });
    }

    const isOwner = purchase?.status === "paid";
    if (!isOwner) {
      return respondDebug(403, "not-purchased", { purchaseStatus: purchase?.status ?? null });
    }

    // 5) Check sample_url
    if (!ebook.sample_url) {
      return respondDebug(404, "no-sample-url");
    }

    if (debug) {
      // In debug mode, don't stream PDF, just show what we'd use
      return respondDebug(200, "ok", {
        userId,
        ebookId,
        sample_url: ebook.sample_url,
        purchaseStatus: purchase?.status ?? null,
      });
    }

    // 6) Fetch and stream the PDF
    const upstream = await fetch(ebook.sample_url, { cache: "no-store" });
    if (!upstream.ok) {
      console.error("secure-pdf upstream failed", upstream.status);
      return respondDebug(502, "upstream-fail", { upstreamStatus: upstream.status });
    }

    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    headers.set("Pragma", "no-cache");
    headers.set("X-Accel-Buffering", "no");

    return new Response(upstream.body, { status: 200, headers });
  } catch (e: any) {
    console.error("secure-pdf catch error", e);
    return respondDebug(500, "catch", { message: e?.message ?? "Server error" });
  }
}
