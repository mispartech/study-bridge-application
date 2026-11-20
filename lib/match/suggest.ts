import { ALL_COUNTRIES, inCountries } from "./countries"
import { FIELDS } from "./labels"
import { rank } from "."
import type { Catalogue, MatchOptions, MatchProfile } from "./types"

/** What a student could change when a quick search finds nothing, each with how many programmes it opens up. */
export type Suggestion =
  | { kind: "budget"; budget_minor: string; count: number }
  | { kind: "countries"; countries: string[]; count: number }
  | { kind: "field"; field: string; count: number }

const MILLION_KOBO = 100_000_000n

const fits = (profile: MatchProfile, catalogue: Catalogue, options: MatchOptions, countries: readonly string[]) => {
  const r = rank(profile, catalogue, options)
  return inCountries(
    [...r.ranked, ...r.more].map((x) => ({ ...x, country: x.bundle.university.country })),
    countries
  )
}

/**
 * Suggestions when nothing ranks in the chosen countries. Every one is checked by re-running the match, so
 * the number shown is what the student will actually get if they take it.
 */
export function suggest(profile: MatchProfile, catalogue: Catalogue, options: MatchOptions): Suggestion[] {
  const chosen = profile.preferred_countries
  const out: Suggestion[] = []
  const result = rank(profile, catalogue, options)

  // Budget: the smallest raise that brings in the closest options, rounded up to the next million naira.
  const near = result.near_misses.filter(
    (n) => chosen.length === 0 || chosen.includes(n.bundle.university.country as never)
  )
  if (near.length && profile.budget_total_minor !== null) {
    const gap = near.reduce((min, n) => (n.gap_ngn_minor < min ? n.gap_ngn_minor : min), near[0]!.gap_ngn_minor)
    const target = BigInt(profile.budget_total_minor) + gap
    const rounded = ((target + MILLION_KOBO - 1n) / MILLION_KOBO) * MILLION_KOBO
    const count = fits({ ...profile, budget_total_minor: Number(rounded) }, catalogue, options, chosen).length
    if (count > 0) out.push({ kind: "budget", budget_minor: rounded.toString(), count })
  }

  // Countries: what the same search finds elsewhere.
  if (chosen.length > 0) {
    const others = ALL_COUNTRIES.filter((c) => !chosen.includes(c))
    const elsewhere = fits(profile, catalogue, options, others)
    if (elsewhere.length > 0) {
      out.push({ kind: "countries", countries: [...new Set(elsewhere.map((e) => e.country))], count: elsewhere.length })
    }
  }

  // Course: the other course with the most matches in the chosen countries.
  const best = FIELDS.filter((f) => f.value !== profile.field)
    .map((f) => ({ field: f.value, count: fits({ ...profile, field: f.value }, catalogue, options, chosen).length }))
    .sort((a, b) => b.count - a.count)[0]
  if (best && best.count > 0) out.push({ kind: "field", field: best.field, count: best.count })

  return out
}
