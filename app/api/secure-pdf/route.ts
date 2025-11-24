import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type StorageCapableClient = SupabaseClient<any, any, any>;
type ResolvedSource =
  | { kind: "storage"; bucket: string; objectPath: string }
  | { kind: "remote-url"; url: string };

function supabaseForUser(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Secure PDF missing Supabase public credentials");
  }
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
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

async function getAccessToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  const jar = cookies();
  return jar.get("sb-access-token")?.value || "";
}

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
      /* fall through */
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

async function materializeSource(
  source: ResolvedSource | null,
  signer: StorageCapableClient | null,
  fallbackSigner: StorageCapableClient
): Promise<string | null> {
  if (!source) return null;
  if (source.kind === "remote-url") return source.url;

  const client = signer || fallbackSigner;

  if (signer) {
    const { data, error } = await signer.storage.from(source.bucket).createSignedUrl(source.objectPath, 60 * 60);
    if (!error && data?.signedUrl) return data.signedUrl;
  }

  const { data: pub } = client.storage.from(source.bucket).getPublicUrl(source.objectPath);
  if (pub?.publicUrl) return pub.publicUrl;

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const token = await getAccessToken(req);
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const ebookId = searchParams.get("ebookId");
    if (!ebookId) return NextResponse.json({ error: "ebookId required" }, { status: 400 });

    const userClient = supabaseForUser(token);
    const svc = supabaseService();
    const dbClient = svc || userClient;

    const { data: userInfo, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userInfo?.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    const userId = userInfo.user.id;

    const { data: ebook, error: ebookErr } = await dbClient
      .from("ebooks")
      .select("id, published, file_path, sample_url")
      .eq("id", ebookId)
      .maybeSingle();

    if (ebookErr) return NextResponse.json({ error: `DB error: ${ebookErr.message}` }, { status: 500 });
    if (!ebook || ebook.published !== true) {
      return NextResponse.json({ error: "Ebook not found or not published" }, { status: 404 });
    }

    let purchaseStatus = null as string | null;
    let purchaseErr = null as string | null;

    const purchase = await dbClient
      .from("ebook_purchases")
      .select("status")
      .eq("user_id", userId)
      .eq("ebook_id", ebookId)
      .maybeSingle();

    purchaseStatus = purchase.data?.status ?? null;
    if (purchase.error) purchaseErr = purchase.error.message;

    if (purchaseErr && svc) {
      const retry = await svc
        .from("ebook_purchases")
        .select("status")
        .eq("user_id", userId)
        .eq("ebook_id", ebookId)
        .maybeSingle();
      purchaseStatus = retry.data?.status ?? purchaseStatus;
      purchaseErr = retry.error?.message ?? purchaseErr;
    }

    if (purchaseErr) {
      return NextResponse.json({ error: `Purchase check failed: ${purchaseErr}` }, { status: 500 });
    }
    if (purchaseStatus !== "paid") {
      return NextResponse.json({ error: "Not purchased" }, { status: 403 });
    }

    const primarySource = resolveSource(ebook.file_path);
    const fallbackSource = resolveSource(ebook.sample_url);

    const pdfUrl =
      (await materializeSource(primarySource, svc, userClient)) ||
      (await materializeSource(fallbackSource, svc, userClient));

    if (!pdfUrl) {
      return NextResponse.json({ error: "No PDF available for this ebook" }, { status: 404 });
    }

    const upstream = await fetch(pdfUrl, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      const status = upstream.status && upstream.status >= 400 ? upstream.status : 502;
      return NextResponse.json({ error: `Upstream fetch failed (${upstream.status})` }, { status });
    }

    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") || "application/pdf");
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    headers.set("Pragma", "no-cache");
    headers.set("Content-Disposition", "inline");
    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (e: any) {
    console.error("[secure-pdf]", e);
    return NextResponse.json(
      { error: e?.message || "Secure PDF error" },
      { status: 500 }
    );
  }
}
