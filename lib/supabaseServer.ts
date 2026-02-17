// File: lib/supabaseServer.ts
import {
  createClient,
  type SupabaseClientOptions,
} from "@supabase/supabase-js";
import {
  formatSupabaseEnvError,
  validateSupabaseKey,
  validateSupabaseUrl,
} from "@/lib/supabaseEnv";

export function createServerClient(
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
  options: SupabaseClientOptions<"public"> = {}
) {
  const issues = [
    ...validateSupabaseUrl(url, "NEXT_PUBLIC_SUPABASE_URL"),
    ...validateSupabaseKey(
      serviceRoleKey,
      "SUPABASE_SERVICE_ROLE_KEY",
      "service"
    ),
  ];

  if (issues.length > 0) {
    throw new Error(formatSupabaseEnvError("server", issues));
  }

  const safeUrl = (url ?? "").trim();
  const safeServiceRoleKey = (serviceRoleKey ?? "").trim();

  return createClient(safeUrl, safeServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch,
    },
    ...options,
  });
}
