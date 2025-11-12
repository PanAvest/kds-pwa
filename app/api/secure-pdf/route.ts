import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function getUserFromBearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error) return null;
  return data.user ?? null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ebookId = searchParams.get("ebookId");
    if (!ebookId) return NextResponse.json({ error: "ebookId required" }, { status: 400 });

    const user = await getUserFromBearer(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: ebook, error: e1 } = await admin
      .from("ebooks")
      .select("file_path, published")
      .eq("id", ebookId).maybeSingle();
    if (e1) throw e1;
    if (!ebook?.published || !ebook.file_path) return NextResponse.json({ error: "Unavailable" }, { status: 404 });

    const { data: pur } = await admin
      .from("ebook_purchases")
      .select("status")
      .eq("user_id", user.id)
      .eq("ebook_id", ebookId)
      .maybeSingle();
    if (pur?.status !== "paid") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [bucket, ...path] = ebook.file_path.split("/");
    const objectPath = path.join("/");

    const { data: signed, error: e2 } = await admin.storage.from(bucket).createSignedUrl(objectPath, 60 * 60);
    if (e2 || !signed?.signedUrl) throw e2 || new Error("signing failed");

    const fileRes = await fetch(signed.signedUrl, { cache: "no-store" });
    if (!fileRes.ok || !fileRes.body) return NextResponse.json({ error: "File fetch failed" }, { status: 502 });

    const headers = new Headers();
    headers.set("Content-Type", fileRes.headers.get("content-type") || "application/pdf");
    headers.set("Cache-Control", "no-store");
    headers.set("Content-Disposition", "inline");
    return new NextResponse(fileRes.body, { status: fileRes.status, headers });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Secure PDF error" }, { status: 500 });
  }
}
