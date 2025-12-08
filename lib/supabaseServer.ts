import {
  createClient,
  type SupabaseClientOptions,
} from "@supabase/supabase-js";

export function createServerClient(
  url = process.env.NEXT_PUBLIC_SUPABASE_URL!,
  serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!,
  options: SupabaseClientOptions<"public"> = {}
) {
  return createClient(url, serviceRoleKey, {
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
