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

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return null;
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

type ResolvedSource =
  | { kind: "remote-url"; url: string }
  | { kind: "storage"; bucket: string; objectPath: string };

function resolveSource(filePath?: string | null): ResolvedSource | null {
  if (!filePath) return null;
  const trimmed = filePath.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const afterObject = parsed.pathname.split("/storage/v1/object/")[1];
      if (afterObject) {
        const parts = afterObject.split("/").filter(Boolean);
        if (["public", "signed", "sign"].includes(parts[0])) parts.shift();
        const [bucket, ...objParts] = parts;
        if (bucket && objParts.length > 0) {
          return { kind: "storage", bucket, objectPath: decodeURIComponent(objParts.join("/")) };
        }
      }
    } catch {
      /* ignore */
    }
    return { kind: "remote-url", url: trimmed };
  }

  const normalized = trimmed.replace(/^\/+/, "");
  const [bucket, ...rest] = normalized.split("/").filter(Boolean);
  if (bucket && rest.length > 0) {
    return { kind: "storage", bucket, objectPath: rest.join("/") };
  }
  return null;
}

async function materializeSource(source: ResolvedSource | null, signer: ReturnType<typeof supabaseService> | ReturnType<typeof supabaseForToken> | null, fallback: ReturnType<typeof supabaseForToken>) {
  if (!source) return null;
  if (source.kind === "remote-url") return source.url;

  const client = (signer as any) || fallback;
  if (!client) return null;

  if (signer) {
    const { data, error } = await (signer as any).storage.from(source.bucket).createSignedUrl(source.objectPath, 60 * 30);
    if (!error && data?.signedUrl) return data.signedUrl;
  }

  const { data: pub } = (fallback as any).storage.from(source.bucket).getPublicUrl(source.objectPath);
  if (pub?.publicUrl) return pub.publicUrl;
  return null;
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
      .select("id, published, sample_url, file_path")
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

    // 5) Pick the actual PDF source (support Supabase Storage paths)
    const pdfSource = ebook.file_path || ebook.sample_url;
    const resolved = resolveSource(pdfSource);
    if (!resolved) {
      return respondDebug(404, "no-sample-url");
    }

    const svc = supabaseService();
    const signedUrl = await materializeSource(resolved, svc, sb);
    if (!signedUrl) {
      return respondDebug(404, "pdf-missing");
    }

    if (debug) {
      return respondDebug(200, "ok", {
        userId,
        ebookId,
        pdfSource,
        resolved,
        signedUrl,
        purchaseStatus: purchase?.status ?? null,
      });
    }

    // 6) Fetch and stream the PDF
    const upstream = await fetch(signedUrl, { cache: "no-store" });
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
