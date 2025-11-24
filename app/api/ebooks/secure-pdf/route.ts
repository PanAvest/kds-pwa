import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type DebugStep = "ok" | "no-token" | "user-fail" | "ebook-fail" | "purchase-fail" | "upstream-fail" | "catch";
type DebugPayload = {
  step: DebugStep;
  ebookId: string | null;
  hasToken: boolean;
  userId: string | null;
  ebook: { id: string; published: boolean; sample_url: string | null } | null;
  purchase: { status: string | null } | null;
  message?: string;
};

function getSupabaseUserClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function extractToken(req: NextRequest): string {
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const jar = cookies();
  return jar.get("sb-access-token")?.value || "";
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const debugMode = searchParams.get("debug") === "1";
  const ebookId = searchParams.get("ebookId");
  const token = extractToken(req);

  let userId: string | null = null;
  let ebook: { id: string; published: boolean; sample_url: string | null } | null = null;
  let purchase: { status: string | null } | null = null;

  const respondDebug = (status: number, step: DebugStep, message?: string) =>
    NextResponse.json(
      {
        step,
        ebookId: ebookId || null,
        hasToken: !!token,
        userId,
        ebook,
        purchase,
        message,
      } satisfies DebugPayload,
      { status }
    );

  try {
    if (!token) {
      return debugMode
        ? respondDebug(401, "no-token", "Missing access token")
        : NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!ebookId) {
      return debugMode
        ? respondDebug(400, "ebook-fail", "ebookId required")
        : NextResponse.json({ error: "ebookId required" }, { status: 400 });
    }

    const supabase = getSupabaseUserClient(token);

    const { data: userInfo, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userInfo?.user) {
      return debugMode
        ? respondDebug(401, "user-fail", userErr?.message || "Invalid session")
        : NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    userId = userInfo.user.id;

    const { data: ebookRow, error: ebookErr } = await supabase
      .from("ebooks")
      .select("id, published, sample_url")
      .eq("id", ebookId)
      .maybeSingle();
    ebook = ebookRow as typeof ebook;

    if (ebookErr) {
      return debugMode
        ? respondDebug(500, "ebook-fail", ebookErr.message)
        : NextResponse.json({ error: ebookErr.message }, { status: 500 });
    }
    if (!ebook || ebook.published !== true) {
      return debugMode
        ? respondDebug(404, "ebook-fail", "Not found or not published")
        : NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: purchaseRow, error: purchaseErr } = await supabase
      .from("ebook_purchases")
      .select("status")
      .eq("user_id", userId)
      .eq("ebook_id", ebookId)
      .maybeSingle();
    purchase = { status: purchaseRow?.status ?? null };

    if (purchaseErr) {
      return debugMode
        ? respondDebug(500, "purchase-fail", purchaseErr.message)
        : NextResponse.json({ error: purchaseErr.message }, { status: 500 });
    }
    if (purchase?.status !== "paid") {
      return debugMode
        ? respondDebug(403, "purchase-fail", "Not purchased")
        : NextResponse.json({ error: "Not purchased" }, { status: 403 });
    }

    if (!ebook.sample_url) {
      return debugMode
        ? respondDebug(404, "ebook-fail", "No PDF URL configured for this ebook")
        : NextResponse.json({ error: "No PDF URL configured for this ebook" }, { status: 404 });
    }

    const upstream = await fetch(ebook.sample_url, { cache: "no-store" });

    if (debugMode) {
      if (!upstream.ok) {
        return respondDebug(502, "upstream-fail", `Upstream fetch failed (${upstream.status})`);
      }
      return respondDebug(200, "ok");
    }

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "Upstream fetch failed", status: upstream.status }, { status: 502 });
    }

    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") || "application/pdf");
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    headers.set("Pragma", "no-cache");
    headers.set("X-Accel-Buffering", "no");
    headers.set("Content-Disposition", "inline");

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (e: any) {
    console.error("[ebooks/secure-pdf]", e);
    if (debugMode) {
      return NextResponse.json(
        {
          step: "catch",
          ebookId: ebookId || null,
          hasToken: !!token,
          userId,
          ebook,
          purchase,
          message: e?.message || "Secure PDF error",
        } satisfies DebugPayload,
        { status: 500 }
      );
    }
    return NextResponse.json({ error: e?.message || "Secure PDF error" }, { status: 500 });
  }
}
