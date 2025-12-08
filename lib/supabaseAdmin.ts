// File: lib/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js"

/**
 * Server-only Supabase client.
 * Falls back to the public anon key for read-only queries so UI routes keep working
 * even if the service key is missing in an environment.
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url) {
    throw new Error("Missing Supabase URL env")
  }

  const key = serviceKey || anonKey
  if (!key) {
    throw new Error("Missing Supabase key env")
  }

  if (!serviceKey) {
    console.warn("⚠️ Using anon key instead of service key. Add SUPABASE_SERVICE_ROLE_KEY for full access.")
  }

  return createClient(url, key, { auth: { persistSession: false } })
}
