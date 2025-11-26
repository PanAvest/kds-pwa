import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// This generic route now simply forwards to the ebooks secure-pdf handler.
// It exists to keep old callers stable while ensuring behaviour matches the main site.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ebookId = url.searchParams.get("ebookId");
  if (!ebookId) {
    return NextResponse.json({ error: "ebookId required" }, { status: 400 });
  }
  // Preserve Authorization header; let the ebooks route handle auth/entitlement.
  const forward = new URL(`/api/ebooks/secure-pdf?ebookId=${encodeURIComponent(ebookId)}`, req.url);
  return NextResponse.redirect(forward, { status: 307 });
}
