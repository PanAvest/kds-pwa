// File: lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("❌ Missing Supabase envs. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
}

export const supabase = createClient(url!, key!, {
  auth: { persistSession: true, autoRefreshToken: true },
  global: {
    // Log body of failed PostgREST calls so 400s are visible in the console
    fetch: async (input, init) => {
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
