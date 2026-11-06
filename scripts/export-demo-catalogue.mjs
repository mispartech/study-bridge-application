// Writes the demo catalogue to tests/fixtures/demo-catalogue.json so the matching tests run on the
// real 30 demo programmes without a database. tests/db/match.db.test.ts checks it hasn't drifted.
import { writeFileSync } from "node:fs"

import { connect } from "./db.mjs"

export const CATALOGUE_QUERIES = {
  universities: "select * from public.university where is_demo order by name",
  programmes: "select * from public.programme where is_demo order by title, university_id",
  requirements: "select * from public.requirement where is_demo order by programme_id",
  intakes: "select * from public.intake where is_demo order by programme_id, cycle, start_term",
  fees: "select * from public.fee where is_demo order by programme_id, fee_year",
  cityCosts: "select * from public.city_cost where is_demo order by country, city, accommodation_type",
  scholarships: "select * from public.scholarship where is_demo order by name",
  visaRules: "select * from public.visa_rule order by country, rule_type, effective_from, id",
  gradeMappings: "select * from public.grade_mapping order by scale, cgpa_min",
  fxRates: "select * from public.fx_rate where is_demo order by base, rate_kind",
  costEstimates: "select * from public.cost_estimate where is_demo order by country, item",
}

export async function exportCatalogue(db) {
  const out = {}
  for (const [key, sql] of Object.entries(CATALOGUE_QUERIES)) {
    const { rows } = await db.query(`select coalesce(json_agg(t), '[]') as rows from (${sql}) t`)
    out[key] = rows[0].rows
  }
  return out
}

if (process.argv[1]?.endsWith("export-demo-catalogue.mjs")) {
  const db = await connect()
  const catalogue = await exportCatalogue(db)
  await db.end()
  writeFileSync("tests/fixtures/demo-catalogue.json", `${JSON.stringify(catalogue, null, 2)}\n`)
  console.log(Object.fromEntries(Object.entries(catalogue).map(([k, v]) => [k, v.length])))
}
