import type { Currency, FxRates } from "@/lib/money"

import { fieldLabel } from "./labels"
import { isOfficialUrl } from "./official-url"
import type { Bundle, Catalogue, Cost, MatchProfile, MatchResult, RankedProgramme } from "./types"

const DAY_MS = 86_400_000
const RULE_CHANGE_NOTICE_DAYS = 180

export type CostView = {
  currency: Currency
  total_minor: string
  total_ngn_market: string
  total_ngn_official: string
  proof_of_funds_minor: string | null
  affordability: Cost["affordability"]
  accommodation: string
  accommodation_available: boolean
  lines: {
    key: string
    label: string
    amount_minor: string
    currency: Currency
    source_url: string
    estimated: boolean
  }[]
}

export type ProgrammeSummary = {
  id: string
  title: string
  university: string
  city: string
  country: string
  degree: string
  field: string
  duration_months: number
  has_coop: boolean
  stem: boolean
  no_gre: boolean
  min_class: string | null
  ielts_min: number | null
  last_verified_at: string
  source_url: string
  apply_url: string | null
  rules_changing: { label: string; date: string } | null
}

export type CardView = ProgrammeSummary & {
  cost: CostView
  fit: number
  group: RankedProgramme["group"]
  flags: RankedProgramme["flags"]
  start_term: string
  start_month: string | null
  next_deadline: { label: string; date: string }
  days_to_deadline: number
  scholarships: number
}

export type NearMissView = ProgrammeSummary & {
  cost: CostView
  gap_ngn_minor: string
  next_deadline: { label: string; date: string }
  scholarships: {
    name: string
    amount_minor: string | null
    currency: Currency | null
    coverage: string
    deadline: string | null
    url: string
  }[]
}

export type RestrictedView = ProgrammeSummary & { reason: string; reason_url: string; review_due: string | null }
export type NeedsEnglishView = ProgrammeSummary & { tests_planned: string[]; cost: CostView | null }

export type MatchView = {
  band: string | null
  grades_source: string
  budget_minor: string | null
  ranked: CardView[]
  more: CardView[]
  near_misses: NearMissView[]
  restricted: RestrictedView[]
  needs_english: NeedsEnglishView[]
  excluded: Record<string, number>
  fx: { market: FxRates; official: FxRates }
  now: string
}

export function presentCost(cost: Cost): CostView {
  return {
    currency: cost.currency as Currency,
    total_minor: cost.total_minor.toString(),
    total_ngn_market: cost.total_ngn.market.toString(),
    total_ngn_official: cost.total_ngn.official.toString(),
    proof_of_funds_minor: cost.proof_of_funds_minor?.toString() ?? null,
    affordability: cost.affordability,
    accommodation: cost.accommodation,
    accommodation_available: cost.accommodation_available,
    lines: cost.lines.map((l) => ({ ...l, amount_minor: l.amount_minor.toString(), currency: l.currency as Currency })),
  }
}

/** The next rule change for this country that a student should hear about now. */
export function ruleChange(country: string, catalogue: Catalogue, now: Date) {
  const today = now.toISOString().slice(0, 10)
  const until = new Date(now.getTime() + RULE_CHANGE_NOTICE_DAYS * DAY_MS).toISOString().slice(0, 10)
  const next = catalogue.visaRules
    .filter(
      (r) =>
        r.country === country &&
        (r.rule_type === "proof_of_funds" || r.rule_type === "post_study_work") &&
        r.effective_from > today &&
        r.effective_from <= until
    )
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from))[0]
  return next ? { label: next.description, date: next.effective_from } : null
}

export function presentProgramme(bundle: Bundle, catalogue: Catalogue, now: Date): ProgrammeSummary {
  const { programme, university, requirement } = bundle
  return {
    id: programme.id,
    title: programme.title,
    university: university.name,
    city: university.city,
    country: university.country,
    degree: programme.degree_type,
    field: fieldLabel(programme.field),
    duration_months: programme.duration_months,
    has_coop: programme.has_coop_or_placement,
    stem: programme.stem_designated,
    no_gre: requirement?.gre_status !== "required" && requirement?.gre_status !== "one_of_required",
    min_class: requirement?.min_uk_class ?? null,
    ielts_min: requirement?.ielts_min ?? null,
    last_verified_at: programme.last_verified_at,
    source_url: programme.source_url,
    // Apply links must be on an official domain; anything else is withheld.
    apply_url: isOfficialUrl(programme.apply_url, university.official_domains) ? programme.apply_url : null,
    rules_changing: ruleChange(university.country, catalogue, now),
  }
}

function presentCard(r: RankedProgramme, catalogue: Catalogue, now: Date, scholarships: number): CardView {
  return {
    ...presentProgramme(r.bundle, catalogue, now),
    cost: presentCost(r.cost),
    fit: r.scores.fit,
    group: r.group,
    flags: r.flags,
    start_term: r.intake.start_term,
    start_month: r.intake.start_month,
    next_deadline: r.next_deadline,
    days_to_deadline: Math.ceil((new Date(r.next_deadline.date).getTime() - now.getTime()) / DAY_MS),
    scholarships,
  }
}

function latestRates(catalogue: Catalogue, kind: "market" | "official"): FxRates {
  const rows = catalogue.fxRates
    .filter((r) => r.quote === "NGN" && r.rate_kind === kind)
    .sort((a, b) => a.fetched_at.localeCompare(b.fetched_at))
  return Object.fromEntries(rows.map((r) => [r.base, r.rate]))
}

/** The JSON a results page needs: compact, because it crosses Slow 3G, with money as strings. */
export function presentResult(result: MatchResult, profile: MatchProfile, catalogue: Catalogue, now: Date): MatchView {
  const excluded: Record<string, number> = {}
  for (const e of result.excluded) excluded[e.filter] = (excluded[e.filter] ?? 0) + 1
  const card = (r: RankedProgramme) => presentCard(r, catalogue, now, Math.round(r.scores.S * 100) > 0 ? 1 : 0)
  return {
    band: result.academics.band,
    grades_source: result.academics.source,
    budget_minor: profile.budget_total_minor?.toString() ?? null,
    ranked: result.ranked.map(card),
    more: result.more.map(card),
    near_misses: result.near_misses.map((n) => ({
      ...presentProgramme(n.bundle, catalogue, now),
      cost: presentCost(n.cost),
      gap_ngn_minor: n.gap_ngn_minor.toString(),
      next_deadline: n.next_deadline,
      scholarships: n.scholarships.map((s) => ({
        ...s,
        amount_minor: s.amount_minor?.toString() ?? null,
        currency: s.currency as Currency | null,
      })),
    })),
    restricted: result.restricted.map((r) => ({
      ...presentProgramme(r.bundle, catalogue, now),
      reason: r.reason,
      reason_url: r.source_url,
      review_due: r.review_due,
    })),
    needs_english: result.needs_english.map((n) => ({
      ...presentProgramme(n.bundle, catalogue, now),
      tests_planned: n.tests_planned,
      cost: n.cost ? presentCost(n.cost) : null,
    })),
    excluded,
    fx: { market: latestRates(catalogue, "market"), official: latestRates(catalogue, "official") },
    now: now.toISOString(),
  }
}
