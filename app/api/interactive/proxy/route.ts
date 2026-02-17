import { NextResponse } from "next/server";

export const runtime = "edge";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function injectBaseTag(html: string, baseHref: string): string {
  if (/<base\s/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`);
  }
  return `<base href="${baseHref}">${html}`;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: Request) {
  try {
    const requestUrl = new URL(req.url);
    const { searchParams } = requestUrl;
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
    const isHtml = contentType.toLowerCase().includes("text/html");
    const upstreamBasePath = new URL(upstream.url).pathname.replace(
      /\/[^/]*$/,
      "/"
    );
    const localAssetBaseHref = `${requestUrl.origin}/api/interactive/`;

    if (isHtml) {
      const html = await upstream.text();
      const patched = injectBaseTag(html, localAssetBaseHref);

      return new Response(patched, {
        status: upstream.status,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-store",
          ...CORS_HEADERS,
          "X-PWA-Proxy": "1",
          "X-PWA-Proxy-Upstream": targetUrl,
          "X-PWA-Proxy-Base": localAssetBaseHref,
          "X-PWA-Proxy-Upstream-BasePath": upstreamBasePath,
        },
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        ...CORS_HEADERS,
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
