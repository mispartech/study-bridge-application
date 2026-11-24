import type { Tables } from "@/lib/db/database.types"

import { levelOf, workMonthsFor } from "./levels"
import type { Bundle } from "./types"

/**
 * Careers and work permits (docs/CANADA_V1_PLAN.md, step E). Everything is read from reviewed, dated records:
 * a link, demand record, field or institution check that is missing, unapproved, expired or stale gives
 * "unknown" (null), never a claim.
 */
export type Careers = {
  occupations: Tables<"occupation">[]
  demand: Tables<"occupation_demand">[]
  fields: Tables<"work_permit_field">[]
  /** Approved links only. */
  links: { programme_id: string; occupation_id: string }[]
}

export type CareerDemand = {
  code: string
  title: string
  label: string
  /** Province or region, or null for the whole country. */
  region: string | null
  source_url: string
  last_verified_at: string
}

export const STALE_DAYS = 120
const DAY_MS = 86_400_000

const current = (iso: string | null, now: Date) =>
  iso !== null && (now.getTime() - new Date(iso).getTime()) / DAY_MS <= STALE_DAYS
const inForce = (from: string, to: string | null, today: string) => from <= today && (to === null || to >= today)

/** Reviewed, current demand in the programme's own country and region for the occupations it is linked to. */
export function demandFor({ programme, university }: Bundle, careers: Careers | undefined, now: Date): CareerDemand[] {
  if (!careers) return []
  const today = now.toISOString().slice(0, 10)
  const linked = new Set(careers.links.filter((l) => l.programme_id === programme.id).map((l) => l.occupation_id))
  return careers.demand.flatMap((d) => {
    const occupation = careers.occupations.find((o) => o.id === d.occupation_id)
    if (!occupation || !linked.has(d.occupation_id) || occupation.country !== university.country) return []
    if (d.region !== "" && d.region !== university.region) return []
    if (!inForce(d.valid_from, d.valid_to, today) || !current(d.last_verified_at, now)) return []
    return [
      {
        code: occupation.code,
        title: occupation.title,
        label: d.label,
        region: d.region || null,
        source_url: d.source_url,
        last_verified_at: d.last_verified_at,
      },
    ]
  })
}

/**
 * 1 when a linked occupation is in demand here. 0 when it is linked but not listed, and we hold current demand
 * data covering this place. Null when nothing is linked, or the demand data is missing or out of date.
 */
export function demandSignal(bundle: Bundle, careers: Careers | undefined, now: Date): 0 | 1 | null {
  if (!careers?.links.some((l) => l.programme_id === bundle.programme.id)) return null
  if (demandFor(bundle, careers, now).length > 0) return 1
  const { country, region } = bundle.university
  const today = now.toISOString().slice(0, 10)
  const covered = careers.demand.some(
    (d) =>
      (d.region === "" || d.region === region) &&
      inForce(d.valid_from, d.valid_to, today) &&
      current(d.last_verified_at, now) &&
      careers.occupations.some((o) => o.id === d.occupation_id && o.country === country)
  )
  return covered ? 0 : null
}

type PermitRule = {
  min_programme_months?: unknown
  institution_check?: unknown
  non_degree_field_of_study_required?: unknown
}

/**
 * Whether the programme leads to a post-study work permit. The destination's own rule says what to check:
 *   institution_check: "required"     -> the institution must be recorded as eligible, checked recently
 *   institution_check: "not_required" -> no institution check applies
 * A rule that says neither gives null, so nothing is claimed until an editor has stated it.
 */
export function workPermitSignal(
  { programme, university }: Bundle,
  rule: Pick<Tables<"visa_rule">, "value" | "last_verified_at"> | undefined,
  careers: Careers | undefined,
  now: Date
): 0 | 1 | null {
  if (!rule || !current(rule.last_verified_at, now)) return null
  const value = (rule.value ?? {}) as PermitRule
  const minimum = typeof value.min_programme_months === "number" ? value.min_programme_months : 0
  if (workMonthsFor(rule.value, programme) === 0 || programme.duration_months < minimum) return 0

  if (value.institution_check !== "required" && value.institution_check !== "not_required") return null
  if (value.institution_check === "required") {
    if (!current(university.pgwp_checked_at, now)) return null
    if (university.pgwp_eligible === "no") return 0
    if (university.pgwp_eligible !== "yes") return null
  }

  if (levelOf(programme) !== "masters" && value.non_degree_field_of_study_required === true) {
    if (!programme.cip_code) return null
    const today = now.toISOString().slice(0, 10)
    const field = careers?.fields.find((f) => f.country === university.country && f.code === programme.cip_code)
    // Absent from what we hold could mean the list is incomplete here, so it stays unknown.
    if (!field || !current(field.last_verified_at, now)) return null
    return inForce(field.eligible_from, field.eligible_to, today) ? 1 : 0
  }
  return 1
}
