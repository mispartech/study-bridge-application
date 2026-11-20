import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { STAFF_IDLE_MS, STAFF_SEEN_COOKIE } from "@/lib/auth/roles"

const STAFF_PATH = /^\/(admin|api\/admin)(\/|$)/

export async function proxy(request: NextRequest) {
  const response = await refreshSession(request)
  return STAFF_PATH.test(request.nextUrl.pathname) ? staffIdle(request, response) : response
}

/**
 * Staff sessions end after 8 hours without an admin request (docs/SPEC_ACCESS_ADMIN.md, section 3).
 * Every admin request moves the "last seen" time forward.
 */
function staffIdle(request: NextRequest, response: NextResponse) {
  const seen = Number(request.cookies.get(STAFF_SEEN_COOKIE)?.value)
  if (seen && Date.now() - seen > STAFF_IDLE_MS) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Signed out after 8 hours without activity", code: "staff_idle" },
        { status: 401 }
      )
    }
    return NextResponse.redirect(new URL("/staff/expired", request.url))
  }
  response.cookies.set(STAFF_SEEN_COOKIE, String(Date.now()), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    maxAge: 30 * 24 * 60 * 60,
  })
  return response
}

/**
 * Keeps a signed-in student's session alive. Visitors with no session cookie skip Supabase altogether,
 * and getSession only touches the network when the token has actually expired.
 */
async function refreshSession(request: NextRequest) {
  if (!request.cookies.getAll().some((c) => c.name.includes("-auth-token"))) return NextResponse.next()
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )
  await supabase.auth.getSession()
  return response
}

export const config = { matcher: ["/((?!_next/static|_next/image|.*\.(?:ico|png|svg|woff2|txt|xml)$).*)"] }
