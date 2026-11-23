import "server-only"

import { after } from "next/server"

import { serviceClient } from "@/lib/db/service"
import { REFRESH_MS, refreshReferenceRates } from "@/lib/fx/reference-rates"

import { pathwaySchema, type Pathway } from "./pathways"
import type { Catalogue } from "./types"

export const demoModeEnabled = () => process.env.NEXT_PUBLIC_DEMO_MODE === "true"

// Facts change weekly at most, and matching runs on every slider drag.
const CACHE_MS = 5 * 60 * 1000
const cache = new Map<boolean, { at: number; catalogue: Promise<Catalogue> }>()

/** Everything matching reads, cached in memory. Demo rows are left out unless demo mode is on. */
export function loadCatalogue(demoMode: boolean): Promise<Catalogue> {
  scheduleRateRefresh()
  const hit = cache.get(demoMode)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.catalogue
  const catalogue = fetchCatalogue(demoMode)
  cache.set(demoMode, { at: Date.now(), catalogue })
  catalogue.catch(() => cache.delete(demoMode))
  return catalogue
}

let lastRefreshCheck = 0

/** Keeps the reference rate under an hour old without a frequent cron: checked after the response is sent. */
function scheduleRateRefresh() {
  if (Date.now() - lastRefreshCheck < REFRESH_MS) return
  lastRefreshCheck = Date.now()
  try {
    after(async () => {
      if ((await refreshReferenceRates()) === "refreshed") invalidateCatalogue()
    })
  } catch {
    // Outside a request (scripts, tests): the daily cron covers it.
  }
}

/** After an admin publishes or edits a fact. Other server instances catch up within CACHE_MS. */
export const invalidateCatalogue = () => cache.clear()

async function fetchCatalogue(demoMode: boolean): Promise<Catalogue> {
  const db = serviceClient()
  const withoutDemo = <Q extends { eq: (column: "is_demo", value: boolean) => Q }>(query: Q) =>
    demoMode ? query : query.eq("is_demo", false)
  // Demo mode shows demo programmes only, so real records under review on Preview never reach Production.
  // Reference data (visa rules, rates, costs) is shared: demo mode needs it too.
  const onlyThisMode = <Q extends { eq: (column: "is_demo", value: boolean) => Q }>(query: Q) =>
    query.eq("is_demo", demoMode)

  const [
    universities,
    programmes,
    requirements,
    intakes,
    fees,
    cityCosts,
    scholarships,
    visaRules,
    gradeMappings,
    fxRates,
    costEstimates,
    pathways,
    signals,
  ] = await Promise.all([
    onlyThisMode(db.from("university").select("*")),
    onlyThisMode(db.from("programme").select("*")),
    onlyThisMode(db.from("requirement").select("*")),
    onlyThisMode(db.from("intake").select("*")),
    onlyThisMode(db.from("fee").select("*")),
    withoutDemo(db.from("city_cost").select("*")),
    withoutDemo(db.from("scholarship").select("*")),
    withoutDemo(db.from("visa_rule").select("*")),
    db.from("grade_mapping").select("*"),
    withoutDemo(db.from("fx_rate").select("*")),
    withoutDemo(db.from("cost_estimate").select("*")),
    db.from("pathway").select("key, label, description, active, sort_order").eq("active", true).order("sort_order"),
    db.from("pathway_signal").select("pathway_key, signal, weight"),
  ])
  const data = <T>(res: { data: T[] | null; error: { message: string } | null }): T[] => {
    if (res.error) throw new Error(`Could not load the catalogue: ${res.error.message}`)
    return res.data ?? []
  }
  return {
    universities: data(universities),
    programmes: data(programmes),
    requirements: data(requirements),
    intakes: data(intakes),
    fees: data(fees),
    cityCosts: data(cityCosts),
    scholarships: data(scholarships),
    visaRules: data(visaRules),
    gradeMappings: data(gradeMappings),
    fxRates: data(fxRates),
    costEstimates: data(costEstimates),
    pathways: toPathways(data(pathways), data(signals)),
  }
}

/** Pathway rows with their signal weights. A row that fails validation is left out, never guessed at. */
export function toPathways(
  rows: Omit<Pathway, "signals">[],
  signals: { pathway_key: string; signal: string; weight: number }[]
): Pathway[] {
  return rows.flatMap((row) => {
    const parsed = pathwaySchema.safeParse({
      ...row,
      signals: Object.fromEntries(signals.filter((s) => s.pathway_key === row.key).map((s) => [s.signal, s.weight])),
    })
    return parsed.success ? [parsed.data] : []
  })
}
