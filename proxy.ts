import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export function proxy(request: NextRequest) {
  return request.nextUrl.pathname.startsWith("/admin") ? guardAdmin(request) : refreshSession(request)
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

/**
 * Guards /admin with HTTP Basic auth until staff accounts exist. With ADMIN_USER or
 * ADMIN_PASSWORD unset, admin pages are disabled (404) rather than left open.
 */
function guardAdmin(request: NextRequest) {
  const user = process.env.ADMIN_USER
  const password = process.env.ADMIN_PASSWORD
  if (!user || !password) return new NextResponse(null, { status: 404 })

  const header = request.headers.get("authorization") ?? ""
  const [scheme, encoded] = header.split(" ")
  if (scheme === "Basic" && encoded) {
    const decoded = atob(encoded)
    const sep = decoded.indexOf(":")
    if (sep > 0 && timingSafeEqual(decoded.slice(0, sep), user) && timingSafeEqual(decoded.slice(sep + 1), password)) {
      return NextResponse.next()
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="StudyBridge admin", charset="UTF-8"' },
  })
}

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  let diff = ea.length ^ eb.length
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0)
  return diff === 0
}

export const config = { matcher: ["/((?!_next/static|_next/image|.*\.(?:ico|png|svg|woff2|txt|xml)$).*)"] }
