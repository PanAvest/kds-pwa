import { NextResponse } from "next/server";

export const runtime = "edge";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const MAIN_ORIGIN =
  process.env.NEXT_PUBLIC_MAIN_SITE_ORIGIN?.replace(/\/+$/, "") ||
  "https://panavestkds.com";
const FALLBACK_INTERACTIVE_BASE = "/interactive/ghie-business-ethics/";

function cleanAssetPath(parts: string[] | undefined): string | null {
  if (!parts || parts.length === 0) return null;
  const joined = parts.join("/").trim();
  if (!joined) return null;
  if (joined.includes("..")) return null;
  return joined.replace(/^\/+/, "");
}

function toBaseDir(path: string): string {
  const withLeading = path.startsWith("/") ? path : `/${path}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

function extractBaseDirFromReferer(req: Request): string | null {
  const referer = req.headers.get("referer");
  if (!referer) return null;

  try {
    const refUrl = new URL(referer);
    const rawPath = refUrl.searchParams.get("path");
    if (!rawPath) return null;

    let normalized = rawPath.trim();
    if (!normalized) return null;

    if (/^https?:\/\//i.test(normalized)) {
      const absolute = new URL(normalized);
      return toBaseDir(absolute.pathname.replace(/\/[^/]*$/, "/"));
    }

    if (!normalized.startsWith("/")) normalized = `/${normalized}`;
    if (!/\.html?$/i.test(normalized)) {
      normalized = normalized.endsWith("/")
        ? `${normalized}story_html5.html`
        : `${normalized}/story_html5.html`;
    }
    return toBaseDir(normalized.replace(/\/[^/]*$/, "/"));
  } catch {
    return null;
  }
}

function joinPath(baseDir: string, assetPath: string): string {
  return `${toBaseDir(baseDir)}${assetPath.replace(/^\/+/, "")}`.replace(
    /\/{2,}/g,
    "/"
  );
}

function buildAssetCandidates(assetPath: string): string[] {
  const normalized = assetPath.replace(/^\/+/, "");
  const candidates = new Set<string>([normalized]);
  const hasNestedPath = normalized.includes("/");
  const name = normalized.split("/").pop() || normalized;

  if (!hasNestedPath) {
    if (/^(paths|data)\.js$/i.test(name)) {
      candidates.add(`html5/data/js/${name}`);
    }
    if (/^(bootstrapper|slides|frame\.desktop|frame\.mobile)\.min\.js$/i.test(name)) {
      candidates.add(`html5/lib/scripts/${name}`);
    }
    if (/^(desktop|mobile)\.min\.css(\.map)?$/i.test(name)) {
      candidates.add(`html5/lib/stylesheets/${name}`);
    }
  }

  return Array.from(candidates);
}

function createResponse(
  body: ReadableStream<Uint8Array> | null,
  status: number,
  contentType: string,
  extraHeaders: Record<string, string>
) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function emptySourceMap(path: string) {
  const file = path.split("/").pop() || "style.css";
  return JSON.stringify({
    version: 3,
    file,
    sources: [],
    names: [],
    mappings: "",
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ asset?: string[] }> }
) {
  try {
    const resolvedParams = await params;
    const assetPath = cleanAssetPath(resolvedParams.asset);
    if (!assetPath) {
      return NextResponse.json(
        { error: "Invalid interactive asset path." },
        { status: 400 }
      );
    }

    // Primary: infer the interactive directory from the proxy iframe referer.
    const inferredBase = extractBaseDirFromReferer(req);
    const baseDir = inferredBase || FALLBACK_INTERACTIVE_BASE;
    const requestUrl = new URL(req.url);
    const candidates = buildAssetCandidates(assetPath);

    for (const candidate of candidates) {
      const localPath = joinPath(baseDir, candidate);
      if (localPath.startsWith("/api/interactive/")) continue;

      const localUrl = new URL(localPath, requestUrl.origin);
      const local = await fetch(localUrl.toString(), {
        headers: { "User-Agent": "KDS-PWA-Interactive-Asset-Proxy-Local" },
        redirect: "follow",
      });

      if (local.ok) {
        const contentType =
          local.headers.get("content-type") || "application/octet-stream";
        return createResponse(local.body, local.status, contentType, {
          "X-Interactive-Asset-Proxy": "1",
          "X-Interactive-Asset-Source": "local",
          "X-Interactive-Asset-Local": localUrl.toString(),
          "X-Interactive-Asset-Candidate": candidate,
        });
      }
    }

    for (const candidate of candidates) {
      const target = new URL(joinPath(baseDir, candidate), MAIN_ORIGIN);
      const upstream = await fetch(target.toString(), {
        headers: { "User-Agent": "KDS-PWA-Interactive-Asset-Proxy" },
        redirect: "follow",
      });

      if (upstream.ok) {
        const contentType =
          upstream.headers.get("content-type") || "application/octet-stream";
        return createResponse(upstream.body, upstream.status, contentType, {
          "X-Interactive-Asset-Proxy": "1",
          "X-Interactive-Asset-Source": "upstream",
          "X-Interactive-Asset-Upstream": target.toString(),
          "X-Interactive-Asset-Candidate": candidate,
        });
      }
    }

    if (/\.css\.map$/i.test(assetPath)) {
      return new Response(emptySourceMap(assetPath), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          ...CORS_HEADERS,
          "X-Interactive-Asset-Proxy": "1",
          "X-Interactive-Asset-Source": "generated",
        },
      });
    }

    return NextResponse.json(
      {
        error: "Interactive asset not found.",
        assetPath,
        candidates,
        baseDir,
      },
      { status: 404 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
