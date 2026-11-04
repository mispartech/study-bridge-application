import { NextResponse } from "next/server"
import { z } from "zod"

import { demoModeEnabled, loadCatalogue } from "@/lib/match/catalogue"
import { matchProfile, rank, serialise, type MatchResult, type RankedProgramme } from "@/lib/match"

function summary(result: MatchResult) {
  const card = ({ bundle, ...r }: RankedProgramme) => ({
    programme: bundle.programme,
    university: bundle.university,
    fee: bundle.fee,
    ...r,
  })
  return {
    academics: result.academics,
    ranked: result.ranked.map(card),
    more: result.more.map(card),
    near_misses: result.near_misses.map(({ bundle, ...r }) => ({
      programme: bundle.programme,
      university: bundle.university,
      ...r,
    })),
    restricted: result.restricted.map(({ bundle, ...r }) => ({
      programme: bundle.programme,
      university: bundle.university,
      ...r,
    })),
    needs_english: result.needs_english.map(({ bundle, ...r }) => ({
      programme: bundle.programme,
      university: bundle.university,
      ...r,
    })),
    excluded: result.excluded,
  }
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const parsed = matchProfile.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile", issues: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const demoMode = demoModeEnabled()
  const catalogue = await loadCatalogue(demoMode)
  const result = rank(parsed.data, catalogue, { now: new Date(), demoMode })
  return new Response(serialise(summary(result)), { headers: { "content-type": "application/json" } })
}
