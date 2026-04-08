const DEFAULT_MAIN_SITE_ORIGIN = "https://www.panavestkds.com";
const ALLOWED_INTERACTIVE_PREFIXES = ["/interactive/"];

function normalizeEntryPath(pathname: string) {
  let normalized = pathname.trim();
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  if (!/\.html?$/i.test(normalized)) {
    normalized = normalized.endsWith("/")
      ? `${normalized}story_html5.html`
      : `${normalized}/story_html5.html`;
  }
  return normalized.replace(/\/{2,}/g, "/");
}

export function getMainSiteOrigin() {
  return (
    process.env.NEXT_PUBLIC_MAIN_SITE_ORIGIN?.replace(/\/+$/, "") ||
    DEFAULT_MAIN_SITE_ORIGIN
  );
}

export function normalizeInteractiveTarget(raw: string | null | undefined) {
  const mainOrigin = getMainSiteOrigin();
  const baseOrigin = new URL(mainOrigin).origin;

  if (!raw?.trim()) {
    return { mainOrigin, relative: null as string | null, absolute: null as string | null };
  }

  const trimmed = raw.trim();
  let target = /^https?:\/\//i.test(trimmed)
    ? new URL(trimmed)
    : new URL(trimmed.startsWith("/") ? trimmed : `/${trimmed}`, mainOrigin);

  if (target.origin !== baseOrigin) {
    throw new Error("Interactive content must stay on the main site origin.");
  }

  target.hash = "";
  target.pathname = normalizeEntryPath(target.pathname);

  if (target.pathname.includes("..")) {
    throw new Error("Interactive paths cannot traverse directories.");
  }

  if (!ALLOWED_INTERACTIVE_PREFIXES.some((prefix) => target.pathname.startsWith(prefix))) {
    throw new Error("Only /interactive/ content can be proxied.");
  }

  return {
    mainOrigin,
    relative: `${target.pathname}${target.search}`,
    absolute: target.toString(),
  };
}

