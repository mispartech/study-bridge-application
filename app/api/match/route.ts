import { NextResponse } from "next/server"
import { z } from "zod"

import { demoModeEnabled, loadCatalogue } from "@/lib/match/catalogue"
import { inCountries } from "@/lib/match/countries"
import { matchProfile, rank } from "@/lib/match"
import { presentResult } from "@/lib/match/present"
import { failureResponse } from "@/lib/server-errors"

const QUICK_RESULTS = 3

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const parsed = matchProfile.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile", issues: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const demoMode = demoModeEnabled()
  const catalogue = await loadCatalogue(demoMode).catch((err: unknown) => failureResponse(err))
  if (catalogue instanceof NextResponse) return catalogue
  const now = new Date()
  const result = rank(parsed.data, catalogue, { now, demoMode })
  const view = presentResult(result, parsed.data, catalogue, now)
  if (!parsed.data.quick_match) return NextResponse.json(view)
  // The landing page shows 3 results, and every byte counts on its first visit.
  const { ranked, near_misses } = view
  const chosen = parsed.data.preferred_countries
  return NextResponse.json({
    ...view,
    ranked: inCountries(ranked, chosen).slice(0, QUICK_RESULTS),
    near_misses: inCountries(near_misses, chosen).slice(0, QUICK_RESULTS),
    hidden_by_country: ranked.length - inCountries(ranked, chosen).length,
    more: [],
    restricted: [],
    needs_english: [],
  })
}
