import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { safeNext } from "@/lib/auth/safe-next"
import { supabaseServer } from "@/lib/auth/server"

/** Lands magic links and Google sign-in. Consent comes next, before anything is stored. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const next = safeNext(url.searchParams.get("next"))
  const code = url.searchParams.get("code")
  const tokenHash = url.searchParams.get("token_hash")
  const type = url.searchParams.get("type") as EmailOtpType | null
  const supabase = await supabaseServer()

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("No sign-in code") }

  if (error) return NextResponse.redirect(new URL("/sign-in?error=link", url.origin))
  return NextResponse.redirect(new URL(`/consent?next=${encodeURIComponent(next)}`, url.origin))
}
