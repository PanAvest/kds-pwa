import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let path = searchParams.get("path") || "";
    if (!path) {
      return NextResponse.json({ error: "path required" }, { status: 400 });
    }

    // ensure path starts with /
    if (!path.startsWith("/")) {
      path = "/" + path;
    }

    // Canonical origin for the main KDS site
    const origin =
      process.env.NEXT_PUBLIC_MAIN_SITE_ORIGIN?.replace(/\/+$/, "") ||
      "https://panavestkds.com";

    const url = `${origin}${path}`;

    const upstream = await fetch(url, {
      headers: { "User-Agent": "KDS-PWA-Proxy" },
      redirect: "follow",
    });

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const body = upstream.body;

    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "X-PWA-Proxy": "1",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
