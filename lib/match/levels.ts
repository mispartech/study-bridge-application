import type { Tables } from "@/lib/db/database.types"

/**
 * Programme levels (docs/CANADA_V1_PLAN.md, step C). College credentials sit beside Master's for any country;
 * school-leaver diplomas exist in the schema but aren't offered yet, since students here already hold a degree.
 */
export type Level = Tables<"programme">["level"]
export type LevelPreference = "masters" | "certificate" | "either"

export const LEVEL_LABEL: Record<Level, string> = {
  masters: "Master's",
  postgraduate_certificate: "Postgraduate certificate",
  graduate_diploma: "Graduate diploma",
  diploma: "Diploma",
}

export const PREFERENCE_LABEL: Record<LevelPreference, string> = {
  masters: "A Master's degree",
  certificate: "A postgraduate certificate or diploma",
  either: "Either",
}

const ALLOWED: Record<LevelPreference, readonly Level[]> = {
  masters: ["masters"],
  certificate: ["postgraduate_certificate", "graduate_diploma"],
  either: ["masters", "postgraduate_certificate", "graduate_diploma"],
}

/** Older records and fixtures have no level: they are Master's. */
export const levelOf = (programme: { level?: Level | null }): Level => programme.level ?? "masters"

export const levelAllowed = (programme: { level?: Level | null }, preference: LevelPreference) =>
  ALLOWED[preference].includes(levelOf(programme))

type WorkRule = { months?: unknown; non_degree?: unknown; min_programme_months?: unknown }

/**
 * Months of work rights after this programme, from the destination's post-study work rule. The rule's own data
 * says how non-degree programmes are treated, so nothing country-specific lives here:
 *   non_degree: "programme_length"  -> as long as the programme, up to `months` (Canada's PGWP for college)
 *   non_degree: <number>            -> that many months
 *   min_programme_months: <number>  -> shorter programmes give no work rights
 * A rule without `non_degree` treats every programme the same.
 */
export function workMonthsFor(rule: unknown, programme: { level?: Level | null; duration_months: number }): number {
  const value = (rule ?? {}) as WorkRule
  const months = typeof value.months === "number" ? value.months : 0
  if (levelOf(programme) === "masters" || value.non_degree === undefined) return months
  const minimum = typeof value.min_programme_months === "number" ? value.min_programme_months : 0
  if (programme.duration_months < minimum) return 0
  if (value.non_degree === "programme_length") return Math.min(programme.duration_months, months)
  return typeof value.non_degree === "number" ? value.non_degree : months
}
