"use client";

export type InteractiveCourseLike = { interactive_path: string | null } | null | undefined;

/**
 * Resolves the interactive src from a course record.
 * Keeps absolute URLs; otherwise prefixes with the main site origin.
 */
export function buildInteractiveSrc(course: InteractiveCourseLike): string | null {
  const raw = course?.interactive_path?.trim();
  if (!raw) return null;

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }

  const origin =
    (process.env.NEXT_PUBLIC_MAIN_SITE_ORIGIN || "https://panavestkds.com").replace(/\/+$/, "");
  const path = raw.startsWith("/") ? raw : `/${raw}`;

  return `${origin}${path}`;
}
