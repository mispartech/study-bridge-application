import { after, NextResponse } from "next/server"
import { z } from "zod"

import { currentUser } from "@/lib/auth/server"
import type { Json } from "@/lib/db/database.types"
import { serviceClient } from "@/lib/db/service"
import { matchProfile, rank } from "@/lib/match"
import { demoModeEnabled, loadCatalogue } from "@/lib/match/catalogue"
import { presentResult } from "@/lib/match/present"
import { REPORT_CONSENT_VERSION } from "@/lib/report/consent"
import { deliverReport } from "@/lib/report/send"
import { clientIp, LIMITS, REPORT_PER_EMAIL } from "@/lib/security/limits"
import { clientFrom, hashKey, hit, hitBoth, withDeviceCookie } from "@/lib/security/rate-limit"
import { verifyTurnstile } from "@/lib/security/turnstile"
import { failureResponse } from "@/lib/server-errors"

const SNAPSHOT_MATCHES = 10

const body = z.object({
  email: z.email().max(254),
  profile: z.unknown(),
  reminders_consent: z.boolean().default(false),
  marketing_consent: z.boolean().default(false),
  turnstile_token: z.string().max(2048).optional(),
})

/**
 * "Email me this report". Results are worked out here from the profile, never taken from the browser.
 * The email is built and sent after the response, so the student isn't kept waiting.
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Check your email address" }, { status: 400 })
  const profile = matchProfile.safeParse(parsed.data.profile)
  if (!profile.success) return NextResponse.json({ error: "Run your match again, then try" }, { status: 400 })
  const email = parsed.data.email.trim().toLowerCase()
  const emailHash = hashKey(`email:${email}`)
  const client = clientFrom(request)

  const human = await verifyTurnstile(parsed.data.turnstile_token, clientIp(request.headers))
  if (!human) return NextResponse.json({ error: "Security check failed. Refresh and try again." }, { status: 403 })
  const [visitor, address] = await Promise.all([hitBoth(LIMITS.report, client), hit(REPORT_PER_EMAIL, emailHash)])
  if (!visitor.allowed || !address.allowed) {
    const res = NextResponse.json(
      { error: "You've sent the most reports allowed today. Try again tomorrow." },
      { status: 429 }
    )
    return withDeviceCookie(res, client)
  }

  try {
    const demoMode = demoModeEnabled()
    const [catalogue, user] = await Promise.all([loadCatalogue(demoMode), currentUser().catch(() => null)])
    const now = new Date()
    const result = rank(profile.data, catalogue, { now, demoMode })
    const view = presentResult(result, profile.data, catalogue, now)
    const snapshot = {
      ranked: [...view.ranked, ...view.more].slice(0, SNAPSHOT_MATCHES),
      near_misses: view.near_misses,
      restricted: view.restricted,
      fx: view.fx,
      now: view.now,
    }
    const { data, error } = await serviceClient()
      .from("report")
      .insert({
        email,
        email_hash: emailHash,
        profile_snapshot: profile.data as unknown as NonNullable<Json>,
        results_snapshot: snapshot as unknown as NonNullable<Json>,
        reminders_consent: parsed.data.reminders_consent,
        marketing_consent: parsed.data.marketing_consent,
        consent_text_version: REPORT_CONSENT_VERSION,
        // A signed-in student's report belongs to their account from the start.
        ...(user && { claimed_user_id: user.id, claimed_at: now.toISOString() }),
      })
      .select("id")
      .single()
    if (error) throw error
    const origin = new URL(request.url).origin
    after(() =>
      deliverReport({ reportId: data.id, email, origin, profile: profile.data, result, view, catalogue, now })
    )
    return withDeviceCookie(NextResponse.json({ ok: true }, { status: 202 }), client)
  } catch (err) {
    return failureResponse(err)
  }
}
