import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { requireEnv } from "@/lib/server-errors"

import type { Database } from "./database.types"

let client: SupabaseClient<Database> | undefined

/**
 * Supabase client with the service role key. Bypasses RLS: server code only, never
 * reachable from the browser (guarded by "server-only").
 */
export function serviceClient(): SupabaseClient<Database> {
  if (client) return client
  const env = requireEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
  client = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}
