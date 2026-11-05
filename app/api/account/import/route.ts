import { NextResponse } from "next/server"
import { z } from "zod"

import { CONSENT_VERSION } from "@/lib/account/consent"
import { ANALYTICS_COOKIE } from "@/lib/analytics/consent"
import { draftSchema, draftToRow, hasAnswers } from "@/lib/account/profile-row"
import { FREE_SHORTLIST_LIMIT } from "@/lib/account/shortlist"
import { supabaseServer } from "@/lib/auth/server"
import type { Draft } from "@/lib/match/profile-store"

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60

const body = z.object({
  /** True only when the student has just accepted the consent screen. */
  accepted: z.boolean(),
  draft: draftSchema.nullable(),
  saved: z.array(z.uuid()).max(50),
})

/** Moves browser-stored answers and saved programmes into the student's account. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 })

  const { data: existing } = await supabase.from("student_profile").select("id, consent_given_at").maybeSingle()
  if (!existing?.consent_given_at && !parsed.data.accepted) {
    return NextResponse.json({ error: "Consent needed" }, { status: 403 })
  }

  const { draft, saved, accepted } = parsed.data
  const answers = draft && hasAnswers(draft as Draft) ? draftToRow(draft as Draft, new Date()) : {}
  const consent = accepted ? { consent_given_at: new Date().toISOString(), consent_version: CONSENT_VERSION } : {}
  const { data: profile, error } = await supabase
    .from("student_profile")
    .upsert({ user_id: user.id, ...answers, ...consent }, { onConflict: "user_id" })
    .select("id")
    .single()
  if (error || !profile) return NextResponse.json({ error: "Could not save your profile" }, { status: 500 })

  if (saved.length > 0) {
    const { count } = await supabase.from("shortlist").select("id", { count: "exact", head: true })
    const room = Math.max(0, FREE_SHORTLIST_LIMIT - (count ?? 0))
    const rows = saved.slice(0, room).map((programme_id) => ({ student_id: profile.id, programme_id }))
    if (rows.length > 0) {
      const { error: shortlistError } = await supabase
        .from("shortlist")
        .upsert(rows, { onConflict: "student_id,programme_id", ignoreDuplicates: true })
      if (shortlistError) return NextResponse.json({ error: "Could not save your shortlist" }, { status: 500 })
    }
  }
  // Reaching here means consent is on record, which is what turns analytics on for this browser.
  const response = NextResponse.json({ ok: true })
  response.cookies.set(ANALYTICS_COOKIE, "1", { path: "/", sameSite: "lax", maxAge: ONE_YEAR_SECONDS })
  return response
}
