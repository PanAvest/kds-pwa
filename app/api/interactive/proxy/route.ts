import { NextResponse } from "next/server";
import { normalizeInteractiveTarget } from "@/lib/interactiveProxy";

export const runtime = "edge";
const UPSTREAM_TIMEOUT_MS = 15000;

function injectBaseTag(html: string, baseHref: string): string {
  if (/<base\s/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`);
  }
  return `<base href="${baseHref}">${html}`;
}

function cacheHeaderForContentType(contentType: string) {
  if (contentType.toLowerCase().includes("text/html")) {
    return "public, s-maxage=600, stale-while-revalidate=86400";
  }
  return "public, s-maxage=86400, stale-while-revalidate=604800";
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function GET(req: Request) {
  try {
    const requestUrl = new URL(req.url);
    const { searchParams } = requestUrl;
    const rawPath = searchParams.get("path");

    if (!rawPath?.trim()) {
      return NextResponse.json({ error: "path required" }, { status: 400 });
    }

    let normalized;
    try {
      normalized = normalizeInteractiveTarget(rawPath);
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 }
      );
    }

    if (!normalized.absolute) {
      return NextResponse.json({ error: "path required" }, { status: 400 });
    }

    const upstream = await fetch(normalized.absolute, {
      headers: { "User-Agent": "KDS-PWA-Proxy" },
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
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
          "Cache-Control": cacheHeaderForContentType(contentType),
          "X-PWA-Proxy": "1",
          "X-PWA-Proxy-Upstream": normalized.absolute,
          "X-PWA-Proxy-Base": localAssetBaseHref,
          "X-PWA-Proxy-Upstream-BasePath": upstreamBasePath,
        },
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheHeaderForContentType(contentType),
        "X-PWA-Proxy": "1",
        "X-PWA-Proxy-Upstream": normalized.absolute,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
