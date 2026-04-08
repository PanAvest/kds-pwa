export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";

const API_KEY = process.env.GOOGLE_CSE_API_KEY;
const CX = process.env.GOOGLE_CSE_CX;
const QUERY_CHAR_LIMIT = 160;
const UPSTREAM_TIMEOUT_MS = 8000;

export async function GET(req: Request) {
  try {
    const rateLimit = checkRateLimit(req, "api:image", {
      limit: 60,
      windowMs: 5 * 60 * 1000,
    });
    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: "Too many image lookups. Please retry shortly." },
        {
          status: 429,
          headers: {
            ...rateLimit.headers,
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const url = new URL(req.url);
    const query = url.searchParams.get("q")?.trim() || "";

    if (!query) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }
    if (query.length > QUERY_CHAR_LIMIT) {
      return NextResponse.json(
        { error: `Query too long. Limit is ${QUERY_CHAR_LIMIT} characters.` },
        { status: 400, headers: rateLimit.headers }
      );
    }

    if (!API_KEY || !CX) {
      return NextResponse.json({ error: "Missing Google CSE configuration" }, { status: 500 });
    }

    const params = new URLSearchParams({
      key: API_KEY,
      cx: CX,
      q: query,
      searchType: "image",
      num: "1",
      safe: "active",
    });

    const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const body = await response.text();

    if (!response.ok) {
      return NextResponse.json({ error: body.slice(0, 500) }, { status: response.status });
    }

    let data: any;
    try {
      data = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: "Invalid response from Google" }, { status: 502 });
    }

    const item = data?.items?.[0];
    const link = typeof item?.link === "string" ? item.link : "";
    const thumbnail = typeof item?.image?.thumbnailLink === "string" ? item.image.thumbnailLink : "";

    if (!link && !thumbnail) {
      return NextResponse.json({ error: "No image results" }, { status: 404 });
    }

    return NextResponse.json(
      { url: thumbnail || link, thumbnail, link },
      {
        headers: {
          "Cache-Control": "s-maxage=86400, stale-while-revalidate=86400",
          ...rateLimit.headers,
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch image" },
      { status: 500 }
    );
  }
}
