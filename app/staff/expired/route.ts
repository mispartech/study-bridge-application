import { NextResponse } from "next/server"

import { STAFF_SEEN_COOKIE } from "@/lib/auth/roles"
import { supabaseServer } from "@/lib/auth/server"

/** Ends a staff session after 8 hours without admin activity, then asks them to sign in again. */
export async function GET(request: Request) {
  const supabase = await supabaseServer()
  await supabase.auth.signOut({ scope: "local" })
  const response = NextResponse.redirect(new URL("/sign-in?reason=staff_timeout&next=/admin", request.url))
  response.cookies.delete(STAFF_SEEN_COOKIE)
  return response
}
