// File: app/api/ebooks/secure-pdf/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a Supabase client that runs RLS as the user (forward the access token)
function supabaseForToken(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ebookId = searchParams.get("ebookId");
    if (!ebookId) {
      return NextResponse.json({ error: "ebookId required" }, { status: 400 });
    }

    // 1) Get access token from Authorization header or cookie
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
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 2) Identify user
    const sb = supabaseForToken(token);
    const { data: userInfo, error: userErr } = await sb.auth.getUser();
    if (userErr || !userInfo?.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    const userId = userInfo.user.id;

    // 3) Load ebook
    const { data: ebook, error: ebookErr } = await sb
      .from("ebooks")
      .select("id, published, sample_url")
      .eq("id", ebookId)
      .maybeSingle();
    if (ebookErr) {
      const msg =
        typeof ebookErr === "object" &&
        ebookErr !== null &&
        "message" in ebookErr
          ? String((ebookErr as { message?: unknown }).message ?? "DB error")
          : "DB error";
      return NextResponse.json({ error: `DB error: ${msg}` }, { status: 500 });
    }
    if (!ebook || ebook.published !== true) {
      return NextResponse.json({ error: "Ebook not found or not published" }, { status: 404 });
    }

    // 4) Verify account-linked access (paid/free linked rows only)
    const { data: purchase, error: purchaseErr } = await sb
      .from("ebook_purchases")
      .select("status")
      .eq("user_id", userId)
      .eq("ebook_id", ebookId)
      .in("status", ["paid", "free"])
      .maybeSingle();

    if (purchaseErr) {
      return NextResponse.json(
        { error: `Purchase check failed: ${purchaseErr.message}` },
        { status: 500 }
      );
    }
    const isOwner = !!purchase;
    if (!isOwner) {
      return NextResponse.json({ error: "Not linked" }, { status: 403 });
    }

    // 5) Stream the PDF from sample_url (treat as paid URL for now)
    if (!ebook.sample_url) {
      return NextResponse.json({ error: "No PDF URL configured for this ebook" }, { status: 404 });
    }

    const upstream = await fetch(ebook.sample_url, { cache: "no-store" });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream fetch failed`, status: upstream.status },
        { status: 502 }
      );
    }

    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    headers.set("Pragma", "no-cache");
    headers.set("X-Accel-Buffering", "no");

    return new Response(upstream.body, { status: 200, headers });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Server error" },
      { status: 500 }
    );
  }
}
