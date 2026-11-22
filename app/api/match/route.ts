import { after, NextResponse } from "next/server"
import { z } from "zod"

import { demoModeEnabled, loadCatalogue } from "@/lib/match/catalogue"
import { inCountries } from "@/lib/match/countries"
import { matchProfile, rank } from "@/lib/match"
import { currentUser, hasSessionCookie } from "@/lib/auth/server"
import { presentResult } from "@/lib/match/present"
import { suggest } from "@/lib/match/suggest"
import { logSearch, searchLogRow } from "@/lib/match/search-log"
import { LIMITS } from "@/lib/security/limits"
import { clientFrom, hitBoth, withDeviceCookie } from "@/lib/security/rate-limit"
import { checkHuman, HUMAN_REQUIRED, withHumanPass } from "@/lib/security/human-pass"
import { failureResponse } from "@/lib/server-errors"

const QUICK_RESULTS = 3

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const parsed = matchProfile.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile", issues: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const quick = parsed.data.quick_match
  const client = clientFrom(request)
  const token = (body as { turnstile_token?: unknown }).turnstile_token
  const demoMode = demoModeEnabled()
  // The limit, the bot check and the catalogue load run side by side, so protection adds no wait.
  const [limit, human, catalogue] = await Promise.all([
    hitBoth(quick ? LIMITS.quickMatch : LIMITS.match, client),
    quick ? checkHuman(request, token) : Promise.resolve({ human: true, issue: false }),
    loadCatalogue(demoMode).catch((err: unknown) => failureResponse(err)),
  ])
  if (!limit.allowed) {
    const res = NextResponse.json({ error: "Too many searches. Try again in a little while." }, { status: 429 })
    return withDeviceCookie(res, client)
  }
  if (!human.human) return NextResponse.json(HUMAN_REQUIRED, { status: 403 })
  if (catalogue instanceof NextResponse) return catalogue

  const now = new Date()
  const result = rank(parsed.data, catalogue, { now, demoMode })
  const view = presentResult(result, parsed.data, catalogue, now)
  const cookieNames = (request.headers.get("cookie") ?? "").split(";").map((c) => ({ name: c.split("=")[0]!.trim() }))
  const signedIn = hasSessionCookie(cookieNames)
  // Logged after the response is sent, so it never slows results down.
  after(async () => {
    const user = signedIn ? await currentUser().catch(() => null) : null
    await logSearch(searchLogRow(parsed.data, view, user?.id ?? null))
  })
  if (!quick) return withDeviceCookie(NextResponse.json(view), client)
  // The landing page shows 3 results, and every byte counts on its first visit.
  const { ranked, near_misses } = view
  const chosen = parsed.data.preferred_countries
  const shown = inCountries(ranked, chosen)
  // Nothing fits: say exactly what would change that, rather than a dead end.
  const suggestions = shown.length === 0 ? suggest(parsed.data, catalogue, { now, demoMode }) : []
  const res = withDeviceCookie(
    NextResponse.json({
      ...view,
      ranked: shown.slice(0, QUICK_RESULTS),
      near_misses: inCountries(near_misses, chosen).slice(0, QUICK_RESULTS),
      hidden_by_country: ranked.length - shown.length,
      suggestions,
      more: [],
      restricted: [],
      needs_english: [],
    }),
    client
  )
  return human.issue ? withHumanPass(res, client) : res
}
