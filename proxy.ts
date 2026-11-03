import { NextResponse, type NextRequest } from "next/server"

/**
 * Guards /admin with HTTP Basic auth until staff accounts exist. With ADMIN_USER or
 * ADMIN_PASSWORD unset, admin pages are disabled (404) rather than left open.
 */
export function proxy(request: NextRequest) {
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

export const config = { matcher: ["/admin/:path*"] }
