import { NextResponse } from "next/server";

export const runtime = "edge";

function normalizeInteractive(raw: string | null | undefined) {
  const mainOrigin = (
    process.env.NEXT_PUBLIC_MAIN_SITE_ORIGIN ||
    "https://panavestkds.com"
  ).replace(/\/+$/, "");

  if (!raw) {
    return { mainOrigin, raw: null, relative: null, absolute: null };
  }

  let trimmed = raw.trim();
  if (!trimmed) {
    return { mainOrigin, raw, relative: null, absolute: null };
  }

  // If it's already a full URL, just use it
  if (/^https?:\/\//i.test(trimmed)) {
    return {
      mainOrigin,
      raw,
      relative: trimmed,
      absolute: trimmed,
    };
  }

  // Treat as relative path from mainOrigin
  if (!trimmed.startsWith("/")) {
    trimmed = `/${trimmed}`;
  }

  const hasHtml = /\.html?$/i.test(trimmed);
  let relative = trimmed;

  // If it looks like a folder, assume Storyline default entry
  if (!hasHtml) {
    if (!relative.endsWith("/")) relative += "/";
    relative += "story_html5.html";
  }

  const absolute = `${mainOrigin}${relative}`;
  return { mainOrigin, raw, relative, absolute };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("path");

    const norm = normalizeInteractive(raw);

    if (!norm.absolute) {
      return NextResponse.json(
        {
          ok: false,
          reason: "No absolute URL could be derived from interactive_path.",
          ...norm,
        },
        { status: 400 }
      );
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
