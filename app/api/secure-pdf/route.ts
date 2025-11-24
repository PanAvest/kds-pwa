import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function supabaseForUser(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error("Secure PDF missing Supabase service credentials");
  }
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function getAccessToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  const jar = cookies();
  return jar.get("sb-access-token")?.value || "";
}

export async function GET(req: NextRequest) {
  try {
    const token = await getAccessToken(req);
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const ebookId = searchParams.get("ebookId");
    if (!ebookId) return NextResponse.json({ error: "ebookId required" }, { status: 400 });

    const sb = supabaseForUser(token);
    const { data: userInfo, error: userErr } = await sb.auth.getUser();
    if (userErr || !userInfo?.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    const userId = userInfo.user.id;

    // Load ebook metadata (storage path or sample_url)
    const { data: ebook, error: ebookErr } = await sb
      .from("ebooks")
      .select("id, published, file_path, sample_url")
      .eq("id", ebookId)
      .maybeSingle();

    if (ebookErr) return NextResponse.json({ error: `DB error: ${ebookErr.message}` }, { status: 500 });
    if (!ebook || ebook.published !== true) {
      return NextResponse.json({ error: "Ebook not found or not published" }, { status: 404 });
    }

    // Verify ownership
    const { data: purchase, error: purchaseErr } = await sb
      .from("ebook_purchases")
      .select("status")
      .eq("user_id", userId)
      .eq("ebook_id", ebookId)
      .maybeSingle();

    if (purchaseErr) return NextResponse.json({ error: `Purchase check failed: ${purchaseErr.message}` }, { status: 500 });
    if (purchase?.status !== "paid") {
      return NextResponse.json({ error: "Not purchased" }, { status: 403 });
    }

    // Resolve PDF source
    let pdfUrl: string | null = null;
    let contentType = "application/pdf";

    if (ebook.file_path) {
      const [bucket, ...rest] = ebook.file_path.split("/");
      const objectPath = rest.join("/");
      if (!bucket || !objectPath) {
        return NextResponse.json({ error: "Invalid file path" }, { status: 500 });
      }
      const svc = supabaseService();
      const { data: signed, error: signErr } = await svc.storage.from(bucket).createSignedUrl(objectPath, 60 * 60);
      if (signErr || !signed?.signedUrl) {
        return NextResponse.json({ error: signErr?.message || "Failed to sign URL" }, { status: 500 });
      }
      pdfUrl = signed.signedUrl;
    } else if (ebook.sample_url) {
      pdfUrl = ebook.sample_url;
    }

    if (!pdfUrl) {
      return NextResponse.json({ error: "No PDF available for this ebook" }, { status: 404 });
    }

    const upstream = await fetch(pdfUrl, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: `Upstream fetch failed`, status: upstream.status }, { status: 502 });
    }

    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") || contentType);
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    headers.set("Pragma", "no-cache");
    headers.set("Content-Disposition", "inline");
    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Secure PDF error" },
      { status: 500 }
    );
  }
}
