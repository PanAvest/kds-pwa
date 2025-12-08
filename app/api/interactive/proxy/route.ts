import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let path = searchParams.get("path") || "";

    if (!path) {
      return NextResponse.json({ error: "path required" }, { status: 400 });
    }

    // Trim stray whitespace
    path = path.trim();

    const mainOrigin =
      process.env.NEXT_PUBLIC_MAIN_SITE_ORIGIN?.replace(/\/+$/, "") ||
      "https://panavestkds.com";

    // If "path" is a full URL, use it directly
    let targetUrl: string;
    if (/^https?:\/\//i.test(path)) {
      targetUrl = path;
    } else {
      // Treat as relative to mainOrigin
      if (!path.startsWith("/")) {
        path = `/${path}`;
      }
      targetUrl = `${mainOrigin}${path}`;
    }

    const upstream = await fetch(targetUrl, {
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
        "X-PWA-Proxy-Upstream": targetUrl,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
