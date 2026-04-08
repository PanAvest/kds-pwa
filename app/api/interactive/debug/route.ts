import { NextResponse } from "next/server";
import { normalizeInteractiveTarget } from "@/lib/interactiveProxy";
import { requireInternalApiAccess } from "@/lib/serverSecurity";

export const runtime = "edge";

export async function GET(req: Request) {
  const denied = requireInternalApiAccess(req);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("path");
    const norm = normalizeInteractiveTarget(raw);

    if (!norm.absolute) {
      return NextResponse.json({ ok: false, reason: "Missing interactive path." }, { status: 400 });
    }

    const upstreamRes = await fetch(norm.absolute, {
      method: "GET",
      redirect: "follow",
    });

    const contentType = upstreamRes.headers.get("content-type") || null;

    return NextResponse.json({
      ok: upstreamRes.ok,
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      contentType,
      finalUrl: upstreamRes.url,
      ...norm,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: (e as Error).message,
      },
      { status: 500 }
    );
  }
}
