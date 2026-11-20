import { NextResponse } from "next/server"
import { recordActivity } from "@/lib/activity/record"

import { serviceClient } from "@/lib/db/service"
import { PROFILE_COOKIE } from "@/lib/match/profile-store"
import { verifyReport } from "@/lib/report/links"
import { failureResponse } from "@/lib/server-errors"

const PROFILE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

const back = (origin: string, path: string) => NextResponse.redirect(new URL(path, origin), 303)

/**
 * The email's "View and update your results": signs the student in with the address the report went to,
 * creating the account only now, and attaches the report to it. The report's profile goes into the browser
 * so the usual sign-up step moves it into the account after consent.
 */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin
  const form = await request.formData().catch(() => null)
  const id = String(form?.get("r") ?? "")
  const token = String(form?.get("t") ?? "")
  if (!verifyReport(id, "claim", token)) return back(origin, "/sign-in?error=link")
  try {
    const db = serviceClient()
    const { data: report } = await db
      .from("report")
      .select("id, email, profile_snapshot, claimed_user_id, expires_at")
      .eq("id", id)
      .maybeSingle()
    if (!report || new Date(report.expires_at) < new Date()) return back(origin, "/sign-in?error=link")
    // Already opened once: from here on the student signs in the usual way.
    if (report.claimed_user_id) return back(origin, "/sign-in?next=/discover")

    const created = await db.auth.admin.createUser({ email: report.email, email_confirm: true })
    if (created.error && !/already|registered|exists/i.test(created.error.message)) throw created.error
    const { data: link, error } = await db.auth.admin.generateLink({ type: "magiclink", email: report.email })
    if (error) throw error
    const { error: claimError } = await db
      .from("report")
      .update({ claimed_user_id: link.user.id, claimed_at: new Date().toISOString() })
      .eq("id", id)
      .is("claimed_user_id", null)
    if (claimError) throw claimError

    await recordActivity("report_link_opened", {
      actor: { type: "student", id: link.user.id },
      target: { type: "report", id },
    })
    const { hashed_token, verification_type } = link.properties
    const response = back(
      origin,
      `/auth/callback?token_hash=${encodeURIComponent(hashed_token)}&type=${verification_type}&next=/discover`
    )
    response.cookies.set(PROFILE_COOKIE, encodeURIComponent(JSON.stringify(report.profile_snapshot)), {
      path: "/",
      maxAge: PROFILE_COOKIE_MAX_AGE,
      sameSite: "lax",
    })
    return response
  } catch (err) {
    return failureResponse(err)
  }
}
