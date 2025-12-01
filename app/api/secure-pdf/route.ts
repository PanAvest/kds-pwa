export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

// Behaviour: mirror main app secure PDF route. Auth via bearer/cookie, check ebook_purchases.status = 'paid',
// then stream the PDF from sample_url (preferred) or a signed storage URL (fallback if file_path exists).

function supabaseForToken(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase env missing");
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Secure PDF missing Supabase service credentials");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ebookId = searchParams.get("ebookId");
    if (!ebookId) return NextResponse.json({ error: "ebookId required" }, { status: 400 });

    // bearer or cookie token
    const authHeader = req.headers.get("authorization") || "";
    let token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      const jar = await cookies();
      token = jar.get("sb-access-token")?.value || "";
    }
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Identify user (RLS)
    const sb = supabaseForToken(token);
    const { data: userInfo, error: userErr } = await sb.auth.getUser();
    if (userErr || !userInfo?.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const userId = userInfo.user.id;

    // Load ebook meta
    const { data: ebook, error: ebookErr } = await sb
      .from("ebooks")
      .select("id, published, sample_url, file_path")
      .eq("id", ebookId)
      .maybeSingle();
    if (ebookErr) return NextResponse.json({ error: `DB error: ${ebookErr.message}` }, { status: 500 });
    if (!ebook || ebook.published !== true) return NextResponse.json({ error: "Ebook not found or not published" }, { status: 404 });

    // Purchase check
    const { data: purchase, error: purchaseErr } = await sb
      .from("ebook_purchases")
      .select("status")
      .eq("user_id", userId)
      .eq("ebook_id", ebookId)
      .maybeSingle();
    if (purchaseErr) return NextResponse.json({ error: `Purchase check failed: ${purchaseErr.message}` }, { status: 500 });
    if (purchase?.status !== "paid") return NextResponse.json({ error: "Not purchased" }, { status: 403 });

    // Preferred: direct URL stored on ebook (sample_url). Fallback: signed storage from file_path.
    let upstream: Response | null = null;
    let contentType = "application/pdf";

    if (ebook.sample_url) {
      upstream = await fetch(ebook.sample_url, { cache: "no-store" });
      contentType = upstream.headers.get("content-type") || contentType;
      if (!upstream.ok || !upstream.body) {
        return NextResponse.json({ error: `Upstream fetch failed`, status: upstream.status }, { status: 502 });
      }
    } else if (ebook.file_path) {
      const [bucket, ...pathParts] = ebook.file_path.split("/");
      const objectPath = pathParts.join("/");
      const admin = adminClient();
      const { data: signed, error: signErr } = await admin.storage.from(bucket).createSignedUrl(objectPath, 60 * 60);
      if (signErr || !signed?.signedUrl) return NextResponse.json({ error: "signing failed" }, { status: 500 });
      const fileRes = await fetch(signed.signedUrl, { cache: "no-store" });
      if (!fileRes.ok || !fileRes.body) return NextResponse.json({ error: "File fetch failed" }, { status: 502 });
      upstream = fileRes;
      contentType = fileRes.headers.get("content-type") || contentType;
    } else {
      return NextResponse.json({ error: "No PDF URL configured for this ebook" }, { status: 404 });
    }

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    headers.set("Pragma", "no-cache");
    return new Response(upstream.body, { status: 200, headers });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Secure PDF error" }, { status: 500 });
  }
}
