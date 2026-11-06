import { normaliseAcademics } from "./academics"
import { hardFilter } from "./filters"
import { eligibleScholarships, fitScore } from "./score"
import type {
  Bundle,
  Catalogue,
  Cost,
  Group,
  MatchOptions,
  MatchProfile,
  MatchResult,
  NearMiss,
  RankedProgramme,
} from "./types"

const TOP_N = 20
const MAX_PER_UNIVERSITY = 4
const STRONG_FIT = 75
const GOOD_FIT = 55
const NEAR_MISS_BELOW = 3
const MAX_NEAR_MISSES = 5

export function bundles(catalogue: Catalogue, demoMode: boolean): Bundle[] {
  return catalogue.programmes
    .filter((p) => demoMode || !p.is_demo)
    .flatMap((programme) => {
      const university = catalogue.universities.find((u) => u.id === programme.university_id)
      if (!university) return []
      return {
        programme,
        university,
        requirement: catalogue.requirements.find((r) => r.programme_id === programme.id),
        fee: catalogue.fees
          .filter((f) => f.programme_id === programme.id)
          .sort((a, b) => b.fee_year.localeCompare(a.fee_year))[0],
        intakes: catalogue.intakes.filter((i) => i.programme_id === programme.id),
      }
    })
}

export function groupFor(fit: number, reach: boolean, cost: Pick<Cost, "affordability">): Group {
  if (reach || fit < GOOD_FIT) return "reach"
  const withinBudget = cost.affordability === "within" || cost.affordability === "unknown"
  return fit >= STRONG_FIT && withinBudget ? "strong" : "good"
}

/**
 * Stage 3 diversity: at most 4 from one university in the top 20, and at least 2 countries when the
 * student chose more than one. Programmes held back keep their order in `rest`.
 */
export function applyDiversity(
  sorted: RankedProgramme[],
  preferredCountries: string[]
): { top: RankedProgramme[]; rest: RankedProgramme[] } {
  const top: RankedProgramme[] = []
  const rest: RankedProgramme[] = []
  const perUniversity = new Map<string, number>()
  for (const item of sorted) {
    const id = item.bundle.university.id
    const used = perUniversity.get(id) ?? 0
    if (top.length < TOP_N && used < MAX_PER_UNIVERSITY) {
      top.push(item)
      perUniversity.set(id, used + 1)
    } else {
      rest.push(item)
    }
  }

  const countryOf = (r: RankedProgramme) => r.bundle.university.country
  if (preferredCountries.length > 1 && new Set(top.map(countryOf)).size < 2 && top.length) {
    const only = countryOf(top[0]!)
    const swapIn = rest.findIndex((r) => countryOf(r) !== only && preferredCountries.includes(countryOf(r)))
    if (swapIn >= 0) {
      const [incoming] = rest.splice(swapIn, 1)
      if (top.length === TOP_N) rest.unshift(top.pop()!)
      top.push(incoming!)
    }
  }
  return { top, rest }
}

export function rank(profile: MatchProfile, catalogue: Catalogue, options: MatchOptions): MatchResult {
  const academics = normaliseAcademics(profile, catalogue.gradeMappings)
  const result: MatchResult = {
    academics,
    ranked: [],
    more: [],
    near_misses: [],
    restricted: [],
    needs_english: [],
    excluded: [],
  }
  const passed: RankedProgramme[] = []
  const overBudget: NearMiss[] = []

  for (const bundle of bundles(catalogue, options.demoMode)) {
    const outcome = hardFilter(bundle, profile, academics, catalogue, options)
    if (outcome.status === "restricted") {
      const { reason, source_url, review_due } = outcome
      result.restricted.push({ bundle, reason, source_url, review_due })
    } else if (outcome.status === "excluded") {
      const { filter, reason } = outcome
      result.excluded.push({ programme_id: bundle.programme.id, title: bundle.programme.title, filter, reason })
    } else if (outcome.status === "over_budget") {
      const { cost, intake, next_deadline } = outcome
      result.excluded.push({
        programme_id: bundle.programme.id,
        title: bundle.programme.title,
        filter: "budget",
        reason: "Total first-year cost is above 115% of the budget",
      })
      overBudget.push({
        bundle,
        cost,
        intake,
        next_deadline,
        gap_ngn_minor: cost.total_ngn.market - BigInt(profile.budget_total_minor!),
        scholarships: eligibleScholarships(bundle, profile, academics, catalogue, options).map(
          ({ name, amount_minor, currency, coverage, deadline, url }) => ({
            name,
            amount_minor,
            currency,
            coverage,
            deadline,
            url,
          })
        ),
      })
    } else if (outcome.status === "needs_english") {
      result.needs_english.push({ bundle, tests_planned: outcome.tests_planned, cost: outcome.cost })
    } else {
      const scores = fitScore(bundle, outcome, profile, academics, catalogue, options)
      const { cost, intake, next_deadline, reach, flags } = outcome
      const group = groupFor(scores.fit, reach, cost)
      passed.push({ bundle, scores, group, reach, cost, intake, next_deadline, flags })
    }
  }

  passed.sort(
    (a, b) =>
      b.scores.fit - a.scores.fit ||
      Number(a.cost.total_ngn.market - b.cost.total_ngn.market) ||
      a.bundle.programme.id.localeCompare(b.bundle.programme.id)
  )
  const { top, rest } = applyDiversity(passed, profile.preferred_countries)
  result.ranked = top
  result.more = rest
  if (top.length < NEAR_MISS_BELOW) {
    result.near_misses = overBudget.sort((a, b) => Number(a.gap_ngn_minor - b.gap_ngn_minor)).slice(0, MAX_NEAR_MISSES)
  }
  return result
}

export { TOP_N }
