import type { Tables } from "@/lib/db/database.types"

import {
  TERM_FIRST_MONTH,
  type Affordability,
  type Bundle,
  type Catalogue,
  type Cost,
  type CostLine,
  type MatchOptions,
  type MatchProfile,
  type Term,
} from "./types"

const RATE_SCALE = 10_000n
const BUDGET_CEILING_PERCENT = 115n
const VISA_APPLICATION_LEAD_MONTHS = 3
const MAX_LIVING_MONTHS = 12
const UK_MAX_MAINTENANCE_MONTHS = 9

type Intake = Tables<"intake">
type VisaRule = Tables<"visa_rule">
export type RateKind = "official" | "market"

/** Start of an intake: its month, or the first month of its term within the cycle. */
export function intakeStart(intake: Pick<Intake, "start_month" | "start_term" | "cycle">): Date {
  if (intake.start_month) return new Date(`${intake.start_month}T00:00:00Z`)
  const month = TERM_FIRST_MONTH[intake.start_term as Term]
  const year = Number(intake.cycle.slice(0, 4)) + (month < TERM_FIRST_MONTH.fall ? 1 : 0)
  return new Date(Date.UTC(year, month - 1, 1))
}

/** Rules are picked for the expected visa application date, about 3 months before the intake starts. */
export function visaApplicationDate(intake: Pick<Intake, "start_month" | "start_term" | "cycle">): string {
  const date = intakeStart(intake)
  date.setUTCMonth(date.getUTCMonth() - VISA_APPLICATION_LEAD_MONTHS)
  return date.toISOString().slice(0, 10)
}

const usable = <T extends { is_demo: boolean }>(rows: T[], demoMode: boolean) =>
  rows.filter((r) => demoMode || !r.is_demo)

export function ruleOn(
  rules: VisaRule[],
  match: { country: string; type: VisaRule["rule_type"]; region?: string | null; demoMode: boolean },
  date: string
): VisaRule | undefined {
  return usable(rules, match.demoMode)
    .filter(
      (r) =>
        r.country === match.country &&
        r.rule_type === match.type &&
        (match.region === undefined || r.applies_to_region === match.region) &&
        r.effective_from <= date &&
        (r.effective_to === null || r.effective_to >= date)
    )
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]
}

function rate(fx: Catalogue["fxRates"], currency: string, kind: RateKind, demoMode: boolean): bigint | undefined {
  const row = usable(fx, demoMode)
    .filter((r) => r.base === currency && r.quote === "NGN" && r.rate_kind === kind)
    .sort((a, b) => b.fetched_at.localeCompare(a.fetched_at))[0]
  return row ? BigInt(Math.round(row.rate * Number(RATE_SCALE))) : undefined
}

export function toNgn(minor: bigint, currency: string, kind: RateKind, fx: Catalogue["fxRates"], demoMode: boolean) {
  if (currency === "NGN") return minor
  const r = rate(fx, currency, kind, demoMode)
  return r === undefined ? undefined : (minor * r + RATE_SCALE / 2n) / RATE_SCALE
}

/** Cost as a share of budget, in exact integer arithmetic. */
export function affordability(totalNgn: bigint, budget: bigint | null): Affordability {
  if (budget === null) return "unknown"
  if (totalNgn <= budget) return "within"
  return withinCeiling(totalNgn, budget) ? "stretch" : "out_of_reach"
}

export const withinCeiling = (totalNgn: bigint, budget: bigint) => totalNgn * 100n <= budget * BUDGET_CEILING_PERCENT

const num = (rule: VisaRule | undefined, key: string): number | undefined => {
  const v = (rule?.value as Record<string, unknown> | null)?.[key]
  return typeof v === "number" ? v : undefined
}
const majorToMinor = (major: number) => BigInt(Math.round(major * 100))

/** Government fees for one country, in that country's currency. Field names are set by the seed. */
function governmentFees(country: string, rule: VisaRule | undefined, years: number): bigint | undefined {
  const fees: Record<string, (number | undefined)[]> = {
    UK: [num(rule, "visa_fee_gbp"), (num(rule, "ihs_gbp_per_year") ?? NaN) * years],
    CA: [num(rule, "study_permit_cad"), num(rule, "biometrics_cad")],
    US: [num(rule, "sevis_usd"), num(rule, "mrv_usd"), num(rule, "visa_integrity_usd")],
  }
  const parts = fees[country]
  if (!parts || parts.some((p) => p === undefined || Number.isNaN(p))) return undefined
  return majorToMinor(parts.reduce<number>((a, b) => a + b!, 0))
}

export type CostResult = { cost: Cost } | { missing: string }

/** Section 3: total first-year cost, proof-of-funds figure and affordability for one intake. */
export function totalCost(
  bundle: Bundle,
  intake: Intake,
  profile: Pick<MatchProfile, "accommodation_pref" | "budget_total_minor" | "dependants">,
  catalogue: Catalogue,
  { demoMode }: Pick<MatchOptions, "demoMode">
): CostResult {
  const { programme, university, fee } = bundle
  if (!fee) return { missing: "no fee record" }
  const { country, city } = university
  const currency = fee.currency
  const visaDate = visaApplicationDate(intake)
  const years = Math.ceil(programme.duration_months / 12)
  const months = Math.min(programme.duration_months, MAX_LIVING_MONTHS)

  const costs = usable(catalogue.cityCosts, demoMode).filter((c) => c.country === country && c.city === city)
  if (costs.length === 0) return { missing: `no city_cost for ${city}` }
  const wanted = costs.find((c) => c.accommodation_type === profile.accommodation_pref)
  const home = wanted ?? [...costs].sort((a, b) => a.rent_monthly_low_minor - b.rent_monthly_low_minor)[0]!
  const rentMonthly = (BigInt(home.rent_monthly_low_minor) + BigInt(home.rent_monthly_high_minor)) / 2n

  const feesRule = ruleOn(catalogue.visaRules, { country, type: "government_fee", demoMode }, visaDate)
  const government = governmentFees(country, feesRule, years)
  if (government === undefined) return { missing: `no government_fee rule for ${country}` }

  const estimate = (item: string) =>
    usable(catalogue.costEstimates, demoMode).find((e) => e.country === country && e.item === item)
  const health = estimate("health_cover")
  const flights = estimate("flights")
  if (!flights) return { missing: `no flights estimate for ${country}` }
  if (country !== "UK" && !health) return { missing: `no health_cover estimate for ${country}` }
  const healthMinor = health ? BigInt(health.amount_minor) * BigInt(health.per_year ? years : 1) : 0n

  const line = (key: CostLine["key"], label: string, amount: bigint, source_url: string): CostLine => ({
    key,
    label,
    amount_minor: amount,
    currency,
    source_url,
  })
  const lines: CostLine[] = [
    line("tuition", "First-year tuition", BigInt(fee.tuition_per_year_minor), fee.source_url),
    line("rent", `Rent for ${months} months`, rentMonthly * BigInt(months), home.source_url),
    line(
      "living",
      `Living costs for ${months} months`,
      BigInt(home.living_monthly_minor) * BigInt(months),
      home.source_url
    ),
    line("visa_health", "Visa and health", government + healthMinor, feesRule!.source_url),
    line("application_fee", "Application fee", BigInt(fee.application_fee_minor), fee.source_url),
    line("flights", "Flights", BigInt(flights.amount_minor), flights.source_url),
  ]
  if (intake.deposit_minor && !intake.deposit_credited_to_tuition) {
    lines.push(line("deposit", "Deposit", BigInt(intake.deposit_minor), intake.source_url))
  }

  const total = lines.reduce((sum, l) => sum + l.amount_minor, 0n)
  const official = toNgn(total, currency, "official", catalogue.fxRates, demoMode)
  const market = toNgn(total, currency, "market", catalogue.fxRates, demoMode)
  if (official === undefined || market === undefined) return { missing: `no fx_rate for ${currency}` }

  const budget = profile.budget_total_minor === null ? null : BigInt(profile.budget_total_minor)
  return {
    cost: {
      currency,
      lines,
      total_minor: total,
      total_ngn: { official, market },
      proof_of_funds_minor: proofOfFunds(
        bundle,
        intake,
        profile.dependants,
        BigInt(flights.amount_minor),
        catalogue,
        demoMode
      ),
      accommodation: home.accommodation_type,
      accommodation_available: wanted !== undefined,
      affordability: affordability(market, budget),
    },
  }
}

function proofOfFunds(
  { programme, university, fee }: Bundle,
  intake: Intake,
  dependants: number,
  travel: bigint,
  catalogue: Catalogue,
  demoMode: boolean
): bigint | null {
  if (!fee) return null
  const tuition = BigInt(fee.tuition_per_year_minor)
  const date = visaApplicationDate(intake)
  const { country } = university
  if (country === "UK") {
    const region = university.city === "London" ? "London" : "Outside London"
    const rule = ruleOn(catalogue.visaRules, { country, type: "proof_of_funds", region, demoMode }, date)
    const monthly = num(rule, "monthly_gbp")
    if (monthly === undefined) return null
    return tuition + majorToMinor(monthly * Math.min(programme.duration_months, UK_MAX_MAINTENANCE_MONTHS))
  }
  if (country === "CA") {
    const region = university.region === "Quebec" ? "Quebec" : "Outside Quebec"
    const rule = ruleOn(catalogue.visaRules, { country, type: "proof_of_funds", region, demoMode }, date)
    const single = num(rule, "single_cad")
    if (single === undefined) return null
    const family = (num(rule, "each_additional_family_member_cad") ?? 0) * dependants
    return tuition + majorToMinor(single + family) + travel
  }
  return null // US: the I-20 cost of attendance, where a university publishes it
}
