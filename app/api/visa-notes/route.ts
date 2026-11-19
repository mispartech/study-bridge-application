import { NextResponse } from "next/server"
import { z } from "zod"

import { visaRestriction } from "@/lib/match"
import { demoModeEnabled, loadCatalogue } from "@/lib/match/catalogue"
import { ALL_COUNTRIES } from "@/lib/match/countries"
import { failureResponse } from "@/lib/server-errors"

const query = z.object({
  nationality: z.string().regex(/^[A-Z]{2}$/),
  travel_document: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
})

/** Published visa restrictions per country for a nationality, for the note on the country chips. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const parsed = query.safeParse({
    nationality: params.get("nationality"),
    travel_document: params.get("travel_document"),
  })
  if (!parsed.success) return NextResponse.json({ error: "Invalid nationality" }, { status: 400 })
  const demoMode = demoModeEnabled()
  const catalogue = await loadCatalogue(demoMode).catch((err: unknown) => failureResponse(err))
  if (catalogue instanceof NextResponse) return catalogue
  const options = { now: new Date(), demoMode }
  const notes = Object.fromEntries(
    ALL_COUNTRIES.flatMap((country) => {
      const rule = visaRestriction(country, parsed.data, catalogue, options)
      return rule ? [[country, { text: rule.description, source_url: rule.source_url }]] : []
    })
  )
  return NextResponse.json({ notes })
}
