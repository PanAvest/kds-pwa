// File: lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";
import {
  formatSupabaseEnvError,
  validateSupabaseKey,
  validateSupabaseUrl,
} from "@/lib/supabaseEnv";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const envIssues = [
  ...validateSupabaseUrl(url, "NEXT_PUBLIC_SUPABASE_URL"),
  ...validateSupabaseKey(key, "NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon"),
];
const envError =
  envIssues.length > 0 ? formatSupabaseEnvError("client", envIssues) : null;
const fallbackUrl = "https://invalid.localhost";
const fallbackKey = "invalid-anon-key";

if (envError) {
  console.error(`❌ ${envError}`);
}

export const supabase = createClient(url || fallbackUrl, key || fallbackKey, {
  auth: { persistSession: true, autoRefreshToken: true },
  global: {
    // Fail fast with an actionable error when env vars are missing/placeholder.
    fetch: async (input, init) => {
      if (envError) {
        console.error("❌ Supabase request blocked", {
          reason: envError,
          url: String(input),
        });
        return new Response(JSON.stringify({ error: envError }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }

      // Log body of failed PostgREST calls so 400s are visible in the console.
      const res = await fetch(input, init);
      if (!res.ok) {
        let body = "";
        try { body = await res.clone().text(); } catch {}
        console.error("❌ Supabase fetch error", {
          url: String(input),
          status: res.status,
          body,
        });
      }
      return res;
    },
  },
});
