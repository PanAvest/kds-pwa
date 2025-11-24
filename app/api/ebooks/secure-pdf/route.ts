import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabaseUserClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Missing Supabase env");
  }
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
  try {
    const token = extractToken(req);
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const ebookId = searchParams.get("ebookId");
    if (!ebookId) return NextResponse.json({ error: "ebookId required" }, { status: 400 });

    const supabase = getSupabaseUserClient(token);

    const { data: userInfo, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userInfo?.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    const userId = userInfo.user.id;

    const { data: ebook, error: ebookErr } = await supabase
      .from("ebooks")
      .select("id, published, sample_url")
      .eq("id", ebookId)
      .maybeSingle();

    if (ebookErr) return NextResponse.json({ error: ebookErr.message }, { status: 500 });
    if (!ebook || ebook.published !== true) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: purchase, error: purchaseErr } = await supabase
      .from("ebook_purchases")
      .select("status")
      .eq("user_id", userId)
      .eq("ebook_id", ebookId)
      .maybeSingle();

    if (purchaseErr) return NextResponse.json({ error: purchaseErr.message }, { status: 500 });
    if (purchase?.status !== "paid") {
      return NextResponse.json({ error: "Not purchased" }, { status: 403 });
    }

    if (!ebook.sample_url) {
      return NextResponse.json({ error: "No PDF URL configured for this ebook" }, { status: 404 });
    }

    const upstream = await fetch(ebook.sample_url, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: `Upstream fetch failed`, status: upstream.status }, { status: 502 });
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
    return NextResponse.json({ error: e?.message || "Secure PDF error" }, { status: 500 });
  }
}
