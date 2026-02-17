// File: lib/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js"
import {
  formatSupabaseEnvError,
  validateSupabaseKey,
  validateSupabaseUrl,
} from "@/lib/supabaseEnv"

/**
 * Server-only Supabase client.
 * Falls back to the public anon key for read-only queries so UI routes keep working
 * even if the service key is missing in an environment.
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const urlIssues = validateSupabaseUrl(url, "NEXT_PUBLIC_SUPABASE_URL")
  if (urlIssues.length > 0) {
    throw new Error(formatSupabaseEnvError("server", urlIssues))
  }

  const serviceIssues = validateSupabaseKey(
    serviceKey,
    "SUPABASE_SERVICE_ROLE_KEY",
    "service"
  )
  const anonIssues = validateSupabaseKey(
    anonKey,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "anon"
  )

  let key: string | null = null
  if (serviceIssues.length === 0 && serviceKey) {
    key = serviceKey
  } else if (anonIssues.length === 0 && anonKey) {
    key = anonKey
    console.warn(
      "⚠️ Using anon key instead of service key. Add SUPABASE_SERVICE_ROLE_KEY for full access."
    )
    if (serviceKey) {
      console.warn(
        "⚠️ SUPABASE_SERVICE_ROLE_KEY looks invalid; falling back to NEXT_PUBLIC_SUPABASE_ANON_KEY."
      )
    }
  } else {
    throw new Error(
      formatSupabaseEnvError("server", [...serviceIssues, ...anonIssues])
    )
  }

  if (!url || !key) {
    throw new Error(
      formatSupabaseEnvError("server", [
        "Supabase server config resolved to an empty value",
      ])
    )
  }

  return createClient(url, key, { auth: { persistSession: false } })
}
