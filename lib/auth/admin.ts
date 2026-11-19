import "server-only"

import { NextResponse } from "next/server"

import { supabaseServer } from "./server"
import { isAdmin } from "./roles"

/** The verified user if they're an admin, otherwise a response to return. Non-admins learn nothing. */
export async function adminFromRequest() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, denied: NextResponse.json({ error: "Sign in first" }, { status: 401 }) }
  if (!isAdmin(user)) return { user: null, denied: NextResponse.json({ error: "Not found" }, { status: 404 }) }
  return { user, denied: null }
}
