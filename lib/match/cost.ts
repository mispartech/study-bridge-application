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

type Stay = { before_months?: number; after_months?: number; before_days?: number; after_days?: number }
const DAYS_PER_MONTH = 30

/**
 * Months of UK permission for a course: the course plus the time before and after it in Appendix Student
 * ST 25.3, which the length_of_stay rule holds.
 */
export function ukVisaMonths(rule: VisaRule | undefined, courseMonths: number): number | undefined {
  const periods = rule?.value as Record<string, Stay> | null | undefined
  const band =
    courseMonths >= 12
      ? periods?.course_12_months_plus
      : courseMonths >= 6
        ? periods?.course_6_to_12_months
        : periods?.course_under_6_months
  if (!band) return undefined
  const before = (band.before_months ?? 0) + (band.before_days ?? 0) / DAYS_PER_MONTH
  const after = (band.after_months ?? 0) + (band.after_days ?? 0) / DAYS_PER_MONTH
  return before + courseMonths + after
}

/**
 * GOV.UK charges the surcharge on the visa's length: nothing for 6 months or less from outside the UK,
 * then the yearly cost per full year, plus half a year for a remainder of 6 months or less, or a full
 * year for more.
 */
export function healthSurcharge(visaMonths: number, yearly: number): number {
  const HALF_YEAR = 6
  if (visaMonths <= HALF_YEAR) return 0
  const fullYears = Math.floor(visaMonths / 12)
  const rest = visaMonths - fullYears * 12
  const part = rest === 0 ? 0 : rest <= HALF_YEAR ? yearly / 2 : yearly
  return fullYears * yearly + part
}

/** Government fees for one country, in that country's currency. Field names are set by the seed. */
function governmentFees(country: string, rule: VisaRule | undefined, visaMonths: number | undefined) {
  const visa: Record<string, (number | undefined)[]> = {
    UK: [num(rule, "visa_fee_gbp")],
    CA: [num(rule, "study_permit_cad"), num(rule, "biometrics_cad")],
    US: [num(rule, "sevis_usd"), num(rule, "mrv_usd"), num(rule, "visa_integrity_usd")],
  }
  const parts = visa[country]
  const yearly = country === "UK" ? num(rule, "ihs_gbp_per_year") : 0
  if (!parts || yearly === undefined || parts.some((p) => p === undefined)) return undefined
  if (country === "UK" && visaMonths === undefined) return undefined
  return {
    visa: majorToMinor(parts.reduce<number>((a, b) => a + b!, 0)),
    surcharge: majorToMinor(country === "UK" ? healthSurcharge(visaMonths!, yearly) : 0),
  }
}

const isEstimated = (confidence: string) => confidence !== "official" && confidence !== "university_page"

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
  const wanted = costs.find((c) => c.accommodation_type === profile.accommodation_pref)
  const home = wanted ?? [...costs].sort((a, b) => a.rent_monthly_low_minor - b.rent_monthly_low_minor)[0]
  // No city figures yet: the visa maintenance figure is the least a student must show, so it stands in,
  // labelled as a minimum estimate, rather than dropping the programme.
  const minimum = home ? undefined : minimumLiving(bundle, months, visaDate, catalogue, demoMode)
  if (!home && !minimum) return { missing: `no city_cost or maintenance rule for ${city}` }

  const feesRule = ruleOn(catalogue.visaRules, { country, type: "government_fee", demoMode }, visaDate)
  const stayRule = ruleOn(catalogue.visaRules, { country, type: "length_of_stay", demoMode }, visaDate)
  const visaMonths = country === "UK" ? ukVisaMonths(stayRule, programme.duration_months) : undefined
  const government = governmentFees(country, feesRule, visaMonths)
  if (government === undefined) return { missing: `no government_fee or length_of_stay rule for ${country}` }

  // The narrowest estimate wins: a destination city for flights, a province for health cover.
  const estimate = (item: string) => {
    const pool = usable(catalogue.costEstimates, demoMode).filter((e) => e.country === country && e.item === item)
    return (
      pool.find((e) => e.city === city) ??
      pool.find((e) => !e.city && e.region === university.region) ??
      pool.find((e) => !e.city && !e.region)
    )
  }
  const health = estimate("health_cover")
  const flights = estimate("flights")
  if (!flights) return { missing: `no flights estimate for ${country}` }
  if (country !== "UK" && !health) return { missing: `no health_cover estimate for ${country}` }
  const healthMinor = health ? BigInt(health.amount_minor) * BigInt(health.per_year ? years : 1) : 0n

  const line = (
    key: CostLine["key"],
    label: string,
    amount: bigint,
    source: { source_url: string; confidence: string }
  ): CostLine => ({
    key,
    label,
    amount_minor: amount,
    currency,
    source_url: source.source_url,
    estimated: isEstimated(source.confidence),
  })
  const lines: CostLine[] = [
    line("tuition", "First-year tuition", BigInt(fee.tuition_per_year_minor), fee),
    ...(home
      ? [
          line("rent", `Rent for ${months} months`, rentMonthly(home) * BigInt(months), home),
          line("living", `Living costs for ${months} months`, BigInt(home.living_monthly_minor) * BigInt(months), home),
        ]
      : [
          line(
            "living",
            `Rent and living for ${months} months (minimum estimate from the visa funds rule)`,
            minimum!.amount,
            { source_url: minimum!.source_url, confidence: "estimated" }
          ),
        ]),
    line("visa_fee", "Visa fee", government.visa, feesRule!),
    health
      ? line("health_cover", "Health cover", healthMinor, health)
      : line("health_cover", "Immigration Health Surcharge", government.surcharge, feesRule!),
    line("application_fee", "Application fee", BigInt(fee.application_fee_minor), fee),
    line("flights", "Flights", BigInt(flights.amount_minor), flights),
  ]
  if (intake.deposit_minor && !intake.deposit_credited_to_tuition) {
    lines.push(line("deposit", "Deposit", BigInt(intake.deposit_minor), intake))
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
      accommodation: home?.accommodation_type ?? profile.accommodation_pref ?? "university_halls",
      accommodation_available: wanted !== undefined,
      minimum_living_estimate: !home,
      affordability: affordability(market, budget),
    },
  }
}

const rentMonthly = (home: { rent_monthly_low_minor: number; rent_monthly_high_minor: number }) =>
  (BigInt(home.rent_monthly_low_minor) + BigInt(home.rent_monthly_high_minor)) / 2n

/** Rent and living together, from the maintenance figure the visa rules require a student to hold. */
function minimumLiving(
  { university }: Bundle,
  months: number,
  date: string,
  catalogue: Catalogue,
  demoMode: boolean
): { amount: bigint; source_url: string } | undefined {
  const { country } = university
  if (country === "UK") {
    const region = university.city === "London" ? "London" : "Outside London"
    const rule = ruleOn(catalogue.visaRules, { country, type: "proof_of_funds", region, demoMode }, date)
    const monthly = num(rule, "monthly_gbp")
    return monthly === undefined ? undefined : { amount: majorToMinor(monthly * months), source_url: rule!.source_url }
  }
  if (country === "CA") {
    const region = university.region === "Quebec" ? "Quebec" : "Outside Quebec"
    const rule = ruleOn(catalogue.visaRules, { country, type: "proof_of_funds", region, demoMode }, date)
    const yearly = num(rule, "single_cad")
    return yearly === undefined
      ? undefined
      : { amount: majorToMinor((yearly * months) / 12), source_url: rule!.source_url }
  }
  return undefined
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
