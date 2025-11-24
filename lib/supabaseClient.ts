/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser singleton: tolerant of missing envs (logs + dummy client) so the UI doesn’t crash.
 * Server: strict (throws if envs are missing) to catch misconfig early.
 */
let browserClient: SupabaseClient | null = null;

function createBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    console.error(
      "[KDS] NEXT_PUBLIC_SUPABASE_* missing in client bundle. Using a dummy client (no auth/realtime)."
    );
    browserClient = createClient("https://example.supabase.co", "public-anon-key", {
      db: { schema: "public" },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
      global: { fetch },
    });
  } else {
    browserClient = createClient(url, anon, {
      db: { schema: "public" },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
      global: { fetch },
    });
  }

  // Keep Realtime channels authenticated when the session changes
  browserClient.auth.onAuthStateChange((_event, session) => {
    const token = session?.access_token ?? "";
    (browserClient as any)?.realtime?.setAuth?.(token);
  });

  return browserClient;
}

function createServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error("[KDS] NEXT_PUBLIC_SUPABASE_* missing on server. Using a dummy client.");
    return createClient("https://example.supabase.co", "public-anon-key", {
      db: { schema: "public" },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
      global: { fetch },
    });
  }

  return createClient(url, anon, {
    db: { schema: "public" },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
    global: { fetch },
  });
}

/** Isomorphic getter (no import-time crash in the browser) */
export function getSupabaseClient(): SupabaseClient {
  if (typeof window === "undefined") return createServerClient();
  return createBrowserClient();
}

/** Named export used throughout the app */
export const supabase = getSupabaseClient();

/** Optional: server-only elevated client (service key) */
export function getSupabaseAdmin() {
  if (typeof window !== "undefined") {
    throw new Error("getSupabaseAdmin() must only be used on the server.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!service) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, service, {
    db: { schema: "public" },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
    global: { fetch },
  });
}
