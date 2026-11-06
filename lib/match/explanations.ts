import "server-only"

import { readFileSync } from "node:fs"
import path from "node:path"

import { generateStructured, loadPrompt, type JsonSchemaObject } from "@/lib/ai"
import {
  profileBucket,
  readExplanations,
  sourceVersion,
  writeExplanations,
  type AcademicBand,
  type ExplanationContent,
} from "@/lib/ai/explanations"

import { formatShort, type Currency } from "@/lib/money"

import { TOP_N, type Catalogue, type MatchProfile, type MatchResult, type RankedProgramme } from "."

const DAY_MS = 86_400_000
const SCHEMA = JSON.parse(
  readFileSync(path.join(process.cwd(), "schemas", "r2_explanations.schema.json"), "utf8")
) as JsonSchemaObject

export type Explanation = ExplanationContent & { programme_id: string; cached: boolean }

/** R2 input: only facts the engine already holds, so the model has nothing to invent. */
export function r2Input(profile: MatchProfile, result: MatchResult, items: RankedProgramme[], now: Date) {
  return {
    student: {
      field: profile.field,
      academic_band: result.academics.band,
      work_years: profile.work_years,
      budget: profile.budget_total_minor === null ? null : formatShort(profile.budget_total_minor, "NGN"),
      target_cycle: profile.target_cycle,
      preferred_countries: profile.preferred_countries,
      preferred_cities: profile.preferred_cities,
    },
    programmes: items.map((r) => ({
      programme_id: r.bundle.programme.id,
      title: r.bundle.programme.title,
      university: r.bundle.university.name,
      city: r.bundle.university.city,
      country: r.bundle.university.country,
      duration_months: r.bundle.programme.duration_months,
      has_coop_or_placement: r.bundle.programme.has_coop_or_placement,
      group: r.group,
      reach_grades: r.reach,
      scores: r.scores,
      affordability: r.cost.affordability,
      total_first_year: formatShort(r.cost.total_ngn.market, "NGN"),
      total_first_year_local: formatShort(r.cost.total_minor, r.cost.currency as Currency),
      cost_breakdown: r.cost.lines.map((l) => ({
        item: l.label,
        amount: formatShort(l.amount_minor, l.currency as Currency),
        estimated: l.estimated,
      })),
      next_deadline: r.next_deadline,
      days_to_deadline: Math.ceil((new Date(r.next_deadline.date).getTime() - now.getTime()) / DAY_MS),
      min_work_years: r.bundle.requirement?.min_work_years ?? 0,
      checks: r.flags,
    })),
  }
}

export function explanationBucket(profile: MatchProfile, result: MatchResult, catalogue: Catalogue): string {
  const restricted = new Set<string>(
    catalogue.visaRules
      .filter((r) => r.rule_type === "nationality_restriction")
      .flatMap((r) => r.applies_to_nationalities as string[])
  )
  return profileBucket({
    field: profile.field,
    academicBand: (result.academics.band === "pass" ? "unknown" : (result.academics.band ?? "unknown")) as AcademicBand,
    budgetTotalMinorNgn: profile.budget_total_minor,
    nationality: profile.nationality,
    restrictedNationalities: restricted,
  })
}

/** Regenerates only when one of these records changes (timestamps are ignored by sourceVersion). */
const versionOf = (r: RankedProgramme) =>
  sourceVersion([r.bundle.programme, r.bundle.requirement, r.bundle.fee, r.bundle.intakes])

/**
 * Stage 3: yields cached explanations for the top 20 straight away, then generates the rest in one
 * R2 call. A failed call ends the stream without explanations: results never depend on the model.
 */
export async function* explainTop(
  profile: MatchProfile,
  result: MatchResult,
  catalogue: Catalogue,
  { now }: { now: Date }
): AsyncGenerator<Explanation> {
  const top = result.ranked.slice(0, TOP_N)
  if (top.length === 0) return
  const bucket = explanationBucket(profile, result, catalogue)
  const versions = new Map(top.map((r) => [r.bundle.programme.id, versionOf(r)]))
  const hits = await readExplanations(bucket, versions)
  for (const [programme_id, content] of hits) yield { programme_id, ...content, cached: true }

  const missing = top.filter((r) => !hits.has(r.bundle.programme.id))
  if (missing.length === 0) return
  const prompt = await loadPrompt("r2_explanations", {})
  const input = JSON.stringify(r2Input(profile, result, missing, now))
  const generated = await generateStructured<{ explanations: (ExplanationContent & { programme_id: string })[] }>(
    "explanations",
    `${prompt}\n\nInput:\n${input}`,
    SCHEMA,
    { toolName: "record_explanations", toolDescription: "Record one explanation per programme." }
  )
  const known = generated.data.explanations.filter((e) => versions.has(e.programme_id))
  await writeExplanations(
    bucket,
    known.map(({ programme_id, why, watch_out }) => ({
      programmeId: programme_id,
      version: versions.get(programme_id)!,
      content: { why, watch_out },
    })),
    generated.model
  )
  for (const e of known) yield { ...e, cached: false }
}
