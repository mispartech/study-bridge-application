import "server-only"

import { serviceClient } from "@/lib/db/service"

import type { Catalogue } from "./types"

export const demoModeEnabled = () => process.env.NEXT_PUBLIC_DEMO_MODE === "true"

/** Everything matching reads. Demo rows are left out unless demo mode is on. */
export async function loadCatalogue(demoMode: boolean): Promise<Catalogue> {
  const db = serviceClient()
  const withoutDemo = <Q extends { eq: (column: "is_demo", value: boolean) => Q }>(query: Q) =>
    demoMode ? query : query.eq("is_demo", false)

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
  ] = await Promise.all([
    withoutDemo(db.from("university").select("*")),
    withoutDemo(db.from("programme").select("*")),
    withoutDemo(db.from("requirement").select("*")),
    withoutDemo(db.from("intake").select("*")),
    withoutDemo(db.from("fee").select("*")),
    withoutDemo(db.from("city_cost").select("*")),
    withoutDemo(db.from("scholarship").select("*")),
    withoutDemo(db.from("visa_rule").select("*")),
    db.from("grade_mapping").select("*"),
    withoutDemo(db.from("fx_rate").select("*")),
    withoutDemo(db.from("cost_estimate").select("*")),
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
  }
}
