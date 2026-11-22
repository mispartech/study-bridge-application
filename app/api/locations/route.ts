import { NextResponse } from "next/server"
import { z } from "zod"

import { demoModeEnabled, loadCatalogue } from "@/lib/match/catalogue"
import { MAX_COUNTRIES } from "@/lib/match/countries"
import { isCountry, locationsFor } from "@/lib/match/locations"
import { failureResponse } from "@/lib/server-errors"

const query = z
  .string()
  .transform((s) => s.split(",").filter(Boolean))
  .pipe(z.array(z.string().refine(isCountry)).min(1).max(MAX_COUNTRIES))

/** Provinces, states and cities with listed programmes, for the optional picker in the deep search. */
export async function GET(request: Request) {
  const parsed = query.safeParse(new URL(request.url).searchParams.get("countries") ?? "")
  if (!parsed.success) return NextResponse.json({ error: "Choose one or two countries" }, { status: 400 })
  const catalogue = await loadCatalogue(demoModeEnabled()).catch((err: unknown) => failureResponse(err))
  if (catalogue instanceof NextResponse) return catalogue
  const countries = parsed.data.filter(isCountry)
  return NextResponse.json(
    { locations: locationsFor(catalogue, countries) },
    { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" } }
  )
}
