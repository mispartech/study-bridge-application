import { bandIndex } from "./academics"
import { ruleOn, toNgn, visaApplicationDate } from "./cost"
import type { Tables } from "@/lib/db/database.types"
import type { Academics, Band, Bundle, Catalogue, Cost, MatchOptions, MatchProfile, ScoreBreakdown } from "./types"

const round1 = (n: number) => Math.round(n * 10) / 10
const OUTCOMES_UNKNOWN = 0.5
// Share of each band's score; a ranking band is the only outcome data the schema holds so far.
const RANKING_SCORE: Record<string, number> = { top_50: 1, top_100: 0.9, top_200: 0.75, top_500: 0.6 }

export function academicFit(headroom: number, reach: boolean): number {
  if (reach) return 0.3
  return headroom >= 2 ? 1 : headroom === 1 ? 0.8 : 0.6
}

/** 1.0 at or below 70% of budget, falling linearly to 0 at 115%. No budget yet scores mid-way. */
export function budgetFit(totalNgn: bigint, budget: number | null): number {
  if (budget === null) return 0.5
  if (budget === 0) return 0
  const share = Number((totalNgn * 10_000n) / BigInt(budget)) / 10_000
  return Math.max(0, Math.min(1, (1.15 - share) / (1.15 - 0.7)))
}

function careerFit(
  bundle: Bundle,
  intake: Tables<"intake">,
  profile: MatchProfile,
  catalogue: Catalogue,
  o: MatchOptions
) {
  const { programme, university } = bundle
  const date = visaApplicationDate(intake)
  const workMonths = (country: string) => {
    const rule = ruleOn(catalogue.visaRules, { country, type: "post_study_work", demoMode: o.demoMode }, date)
    const months = (rule?.value as { months?: unknown } | undefined)?.months
    return typeof months === "number" ? months : 0
  }
  const countries = profile.preferred_countries.length ? profile.preferred_countries : ["UK", "CA", "US"]
  const longest = Math.max(...countries.map(workMonths))
  const stem = university.country === "US" && programme.stem_designated
  return (
    (programme.field === profile.field ? 0.6 : 0) +
    (stem || programme.has_coop_or_placement ? 0.2 : 0) +
    (longest > 0 && workMonths(university.country) === longest ? 0.2 : 0)
  )
}

function locationFit(bundle: Bundle, cost: Cost, profile: MatchProfile) {
  const { city, country, region } = bundle.university
  const noPreference = profile.preferred_cities.length === 0 && profile.preferred_countries.length === 0
  const inCity = profile.preferred_cities.some((c) => c === city || c === region)
  const inCountry = profile.preferred_countries.includes(country as MatchProfile["preferred_countries"][number])
  const base = inCity ? 1 : inCountry || noPreference ? 0.6 : 0
  return Math.min(1, base + (cost.accommodation_available ? 0.1 : 0))
}

function scholarshipFit(
  bundle: Bundle,
  profile: MatchProfile,
  academics: Academics,
  catalogue: Catalogue,
  { now, demoMode }: MatchOptions
) {
  const { fee, programme, university } = bundle
  if (!fee) return 0
  const today = now.toISOString().slice(0, 10)
  const eligible = catalogue.scholarships.filter(
    (s) =>
      (demoMode || !s.is_demo) &&
      (s.deadline === null || s.deadline > today) &&
      (s.countries.length === 0 || s.countries.includes(university.country)) &&
      (s.fields.length === 0 || s.fields.includes(programme.field)) &&
      (s.eligible_nationalities.length === 0 ||
        (profile.nationality !== null && s.eligible_nationalities.includes(profile.nationality))) &&
      (s.min_uk_class === null ||
        (academics.band !== null && bandIndex(academics.band) >= bandIndex(s.min_uk_class as Band)))
  )
  if (eligible.some((s) => s.amount_minor === null)) return 1 // full or tuition cover with no fixed amount
  const halfTuition = toNgn(
    BigInt(fee.tuition_per_year_minor) / 2n,
    fee.currency,
    "official",
    catalogue.fxRates,
    demoMode
  )
  if (!halfTuition) return 0
  const total = eligible.reduce(
    (sum, s) => sum + (toNgn(BigInt(s.amount_minor!), s.currency!, "official", catalogue.fxRates, demoMode) ?? 0n),
    0n
  )
  return Math.min(1, Number((total * 1000n) / halfTuition) / 1000)
}

/** Stage 2: Fit = sum of weight × component, on the student's weights. */
export function fitScore(
  bundle: Bundle,
  outcome: { cost: Cost; intake: Tables<"intake">; headroom: number; reach: boolean },
  profile: MatchProfile,
  academics: Academics,
  catalogue: Catalogue,
  options: MatchOptions
): ScoreBreakdown {
  const components = {
    A: academicFit(outcome.headroom, outcome.reach),
    B: budgetFit(outcome.cost.total_ngn.market, profile.budget_total_minor),
    C: careerFit(bundle, outcome.intake, profile, catalogue, options),
    L: locationFit(bundle, outcome.cost, profile),
    S: scholarshipFit(bundle, profile, academics, catalogue, options),
    O: RANKING_SCORE[bundle.university.ranking_band ?? ""] ?? OUTCOMES_UNKNOWN,
  }
  const w = profile.weights
  const fit =
    w.A * components.A +
    w.B * components.B +
    w.C * components.C +
    w.L * components.L +
    w.S * components.S +
    w.O * components.O
  return {
    A: round1(components.A * 10) / 10,
    B: Math.round(components.B * 100) / 100,
    C: round1(components.C * 10) / 10,
    L: round1(components.L * 10) / 10,
    S: Math.round(components.S * 100) / 100,
    O: components.O,
    fit: round1(fit),
  }
}
