const PLACEHOLDER_HOST = "example.supabase.co";
const PLACEHOLDER_KEYS = new Set(["anon-key", "service-role-key"]);

type KeyKind = "anon" | "service";

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function isPlaceholderUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.hostname.toLowerCase() === PLACEHOLDER_HOST;
  } catch {
    return false;
  }
}

function isPlaceholderKey(value: string, kind: KeyKind): boolean {
  const normalized = value.toLowerCase();
  if (!normalized) return false;
  if (PLACEHOLDER_KEYS.has(normalized)) return true;
  if (normalized.includes("your-anon-key")) return true;
  if (normalized.includes("your-service-role-key")) return true;
  if (kind === "anon" && normalized === "public-anon-key") return true;
  if (kind === "service" && normalized === "service-role-key-here") return true;
  return false;
}

export function validateSupabaseUrl(
  value: string | null | undefined,
  envName = "NEXT_PUBLIC_SUPABASE_URL"
): string[] {
  const issues: string[] = [];
  const url = clean(value);

  if (!url) {
    issues.push(`${envName} is missing`);
    return issues;
  }

  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) {
      issues.push(`${envName} must start with http:// or https://`);
    }
  } catch {
    issues.push(`${envName} is not a valid URL`);
    return issues;
  }

  if (isPlaceholderUrl(url)) {
    issues.push(
      `${envName} is still set to placeholder https://${PLACEHOLDER_HOST}`
    );
  }

  return issues;
}

export function validateSupabaseKey(
  value: string | null | undefined,
  envName: string,
  kind: KeyKind
): string[] {
  const issues: string[] = [];
  const key = clean(value);

  if (!key) {
    issues.push(`${envName} is missing`);
    return issues;
  }

  if (isPlaceholderKey(key, kind)) {
    issues.push(`${envName} is still set to a placeholder value`);
  }

  return issues;
}

export function formatSupabaseEnvError(
  scope: "client" | "server",
  issues: string[]
): string {
  return `[supabase:${scope}] ${issues.join(
    "; "
  )}. Update .env.local with real Supabase values and restart Next.js.`;
}

