import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export function proxy(request: NextRequest) {
  return refreshSession(request)
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
