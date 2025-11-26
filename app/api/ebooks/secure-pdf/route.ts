// app/api/ebooks/secure-pdf/route.ts (mirror main web app)
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
  const { searchParams } = new URL(req.url);
  const ebookId = searchParams.get("ebookId");
  const debug = searchParams.get("debug") === "1";

  const respond = (status: number, step: string, extra: Record<string, unknown> = {}) => {
    if (!debug && status === 200) return null; // will stream PDF
    return NextResponse.json({ step, ...extra }, { status });
  };

  try {
    if (!ebookId) {
      return NextResponse.json({ error: "ebookId required", step: "missing-ebookId" }, { status: 400 });
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
      return NextResponse.json({ error: "Not authenticated", step: "no-token" }, { status: 401 });
    }

    // 2) Identify user
    const sb = supabaseForToken(token);
    const { data: userInfo, error: userErr } = await sb.auth.getUser();
    if (userErr || !userInfo?.user) {
      return NextResponse.json({ error: "Invalid session", step: "user-auth" }, { status: 401 });
    }
    const userId = userInfo.user.id;

    // 3) Load ebook (minimal columns)
    const { data: ebook, error: ebookErr } = await sb
      .from("ebooks")
      .select("id, published, sample_url, file_path")
      .eq("id", ebookId)
      .maybeSingle();

    if (ebookErr) {
      return NextResponse.json({ error: ebookErr.message, step: "ebook-db" }, { status: 500 });
    }
    if (!ebook || ebook.published !== true) {
      return NextResponse.json({ error: "Ebook not found or not published", step: "ebook-not-found" }, { status: 404 });
    }

    // 4) Verify ownership in ebook_purchases (status must be 'paid')
    const { data: purchase, error: purchaseErr } = await sb
      .from("ebook_purchases")
      .select("status")
      .eq("user_id", userId)
      .eq("ebook_id", ebookId)
      .maybeSingle();

    if (purchaseErr) {
      return NextResponse.json({ error: purchaseErr.message, step: "purchase-db" }, { status: 500 });
    }

    const isOwner = purchase?.status === "paid";
    if (!isOwner) {
      return NextResponse.json({ error: "Not purchased", step: "not-owner", purchaseStatus: purchase?.status ?? null }, { status: 403 });
    }

    // 5) Resolve source: match main site by preferring sample_url, but allow file_path as a fallback if provided.
    const candidates = [ebook.sample_url, ebook.file_path].filter(Boolean) as string[];
    let materialized: string | null = null;
    for (const candidate of candidates) {
      try {
        const trimmed = candidate.trim();
        if (!trimmed) continue;
        if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("//")) {
          materialized = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
        } else {
          // Treat as storage path; use public URL helper (no service key dependency like main site).
          const pathParts = trimmed.replace(/^\/+/, "").split("/").filter(Boolean);
          const bucket = pathParts.shift();
          const objectPath = pathParts.join("/");
          if (bucket && objectPath) {
            const { data: pub } = (sb as any).storage.from(bucket).getPublicUrl(objectPath);
            materialized = pub?.publicUrl || null;
          }
        }
      } catch {
        /* try next candidate */
      }
      if (materialized) break;
    }

    if (!materialized) {
      return NextResponse.json({ error: "No PDF URL configured for this ebook", step: "no-source" }, { status: 404 });
    }

    if (debug) {
      return NextResponse.json(
        { step: "ok", userId, ebookId, source, resolved: materialized, purchaseStatus: purchase?.status ?? null },
        { status: 200 }
      );
    }

    // 6) Fetch and stream the PDF
    let upstream: Response;
    try {
      upstream = await fetch(materialized, { cache: "no-store" });
    } catch (err: any) {
      return NextResponse.json({ error: err?.message ?? "Upstream fetch failed", step: "upstream-fetch" }, { status: 502 });
    }

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "Upstream fetch failed", step: "upstream-status", upstreamStatus: upstream.status }, { status: 502 });
    }

    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    headers.set("Pragma", "no-cache");
    headers.set("X-Accel-Buffering", "no");

    return new Response(upstream.body, { status: 200, headers });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Server error", step: "catch" },
      { status: 500 }
    );
  }
}
