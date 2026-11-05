import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import type { Database } from "@/lib/db/database.types"

/** Supabase client acting as the signed-in student: every query goes through RLS. */
export async function supabaseServer() {
  const store = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll(list) {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options))
          } catch {
            // Server Components can't write cookies; the proxy refreshes the session instead.
          }
        },
      },
    }
  )
}

/** The verified user, checked with Supabase. Use this before anything that depends on who is asking. */
export async function currentUser() {
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.getUser()
  return data.user
}

/** Cheap check that skips the network for anonymous visitors, who are most of the traffic. */
export const hasSessionCookie = (names: { name: string }[]) =>
  names.some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"))
