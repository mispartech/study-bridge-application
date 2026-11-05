import type { Tables } from "@/lib/db/database.types"

import { bandIndex, nigeriaRuleMinimum } from "./academics"
import { totalCost, withinCeiling } from "./cost"
import { fieldMatch } from "./fields"
import type { Academics, Band, Bundle, Catalogue, Cost, MatchFlag, MatchOptions, MatchProfile } from "./types"

const FRESHNESS_DAYS = 120
const DAY_MS = 86_400_000
const REACH_MIN_WORK_YEARS = 2
const WAEC_GRADES = ["A1", "B2", "B3", "C4", "C5", "C6", "D7", "E8", "F9"]

type Requirement = Tables<"requirement">
type Deadline = { label: string; date: string }
type Intake = Tables<"intake">

export type FilterOutcome =
  | { status: "restricted"; reason: string; source_url: string; review_due: string | null }
  | { status: "excluded"; filter: string; reason: string }
  | { status: "needs_english"; tests_planned: string[]; cost: Cost }
  | { status: "over_budget"; cost: Cost; intake: Intake; next_deadline: Deadline }
  | {
      status: "passed"
      cost: Cost
      intake: Intake
      next_deadline: Deadline
      reach: boolean
      headroom: number
      flags: MatchFlag[]
    }

/** A current nationality_restriction rule that covers this student, if any. */
export function visaRestriction(
  country: string,
  profile: Pick<MatchProfile, "nationality" | "travel_document">,
  catalogue: Catalogue,
  { now, demoMode }: MatchOptions
) {
  const today = now.toISOString().slice(0, 10)
  return catalogue.visaRules.find(
    (r) =>
      r.country === country &&
      r.rule_type === "nationality_restriction" &&
      (demoMode || !r.is_demo) &&
      r.effective_from <= today &&
      (r.effective_to === null || r.effective_to >= today) &&
      ((profile.nationality !== null && r.applies_to_nationalities.includes(profile.nationality)) ||
        (profile.travel_document !== null && r.applies_to_travel_documents.includes(profile.travel_document)))
  )
}

export function academicCheck(
  requirement: Requirement,
  profile: Pick<MatchProfile, "nationality" | "cgpa" | "cgpa_scale" | "hnd_pgd" | "work_years">,
  academics: Academics
): { passes: boolean; reach: boolean; headroom: number } {
  const fail = { passes: false, reach: false, headroom: 0 }
  if (academics.band === null) return fail
  const student = bandIndex(academics.band)
  const minimum = bandIndex(requirement.min_uk_class as Band)

  // A university's own Nigeria rule replaces the estimate, except for HND + PGD, which it doesn't address.
  const official =
    profile.nationality === "NG" && !profile.hnd_pgd
      ? nigeriaRuleMinimum(requirement.nigeria_rule, profile.cgpa_scale)
      : null
  const meets =
    official !== null && profile.cgpa !== null
      ? profile.cgpa >= official
      : student >= minimum ||
        (academics.gpa4 !== null && requirement.min_gpa4 !== null && academics.gpa4 >= requirement.min_gpa4)
  if (meets) return { passes: true, reach: false, headroom: Math.max(0, student - minimum) }

  const oneBelow = student >= minimum - 1
  if (requirement.considers_lower_with_experience && oneBelow && profile.work_years >= REACH_MIN_WORK_YEARS) {
    return { passes: true, reach: true, headroom: 0 }
  }
  return fail
}

/** A1 is the best grade. No grade stated by the university, or none from the student, means no waiver. */
function waecMeetsMinimum(requirement: Requirement, grade: string | null) {
  if (!requirement.waec_english_accepted || requirement.waec_min_grade === null || grade === null) return false
  return WAEC_GRADES.indexOf(grade) <= WAEC_GRADES.indexOf(requirement.waec_min_grade)
}

export type EnglishResult = "pass" | "needs_test" | "fail"

export function englishCheck(
  requirement: Requirement,
  profile: MatchProfile
): { result: EnglishResult; unknown: boolean; planned: string[] } {
  const toefl = (requirement.toefl_entries ?? []) as { scale: string; overall_min: number }[]
  const atLeast = (score: number | null, minimum: number | null) =>
    score !== null && minimum !== null && score >= minimum
  const toeflMin = toefl.find((e) => e.scale === profile.toefl_scale)?.overall_min ?? null
  const scored =
    atLeast(profile.ielts, requirement.ielts_min) ||
    atLeast(profile.duolingo, requirement.duolingo_min) ||
    atLeast(profile.pte, requirement.pte_min) ||
    atLeast(profile.toefl, toeflMin)

  const waiver = requirement.english_waiver_text ?? ""
  const waived =
    waecMeetsMinimum(requirement, profile.waec_english_grade) ||
    (profile.english_medium_degree && /taught in english|english[- ]medium|majority[- ]english/i.test(waiver))
  if (scored || waived) return { result: "pass", unknown: false, planned: [] }

  const accepted = {
    ielts: requirement.ielts_min,
    toefl: toefl[0]?.overall_min ?? null,
    duolingo: requirement.duolingo_min,
    pte: requirement.pte_min,
  }
  if (Object.values(accepted).every((m) => m === null)) return { result: "pass", unknown: true, planned: [] }
  const planned = profile.tests_planned.filter((t) => t in accepted && accepted[t as keyof typeof accepted] !== null)
  return { result: planned.length ? "needs_test" : "fail", unknown: false, planned }
}

export function admissionTestCheck(
  requirement: Requirement,
  profile: Pick<MatchProfile, "gre" | "gmat" | "tests_planned">
): { passes: boolean; unknown: boolean; planned: boolean; reason?: string } {
  const heldOrPlanned = { gre: profile.gre !== null, gmat: profile.gmat !== null }
  const planned = { gre: profile.tests_planned.includes("gre"), gmat: profile.tests_planned.includes("gmat") }
  const has = (t: "gre" | "gmat") => heldOrPlanned[t] || planned[t]
  const statuses = { gre: requirement.gre_status, gmat: requirement.gmat_status }

  for (const test of ["gre", "gmat"] as const) {
    if (statuses[test] === "required" && !has(test)) {
      return { passes: false, unknown: false, planned: false, reason: `${test.toUpperCase()} is required` }
    }
  }
  const oneOf = (["gre", "gmat"] as const).filter((t) => statuses[t] === "one_of_required")
  if (oneOf.length && !has("gre") && !has("gmat")) {
    return { passes: false, unknown: false, planned: false, reason: "GRE or GMAT is required" }
  }
  const needed = (["gre", "gmat"] as const).filter(
    (t) => statuses[t] === "required" || statuses[t] === "one_of_required"
  )
  return {
    passes: true,
    unknown: statuses.gre === null || statuses.gmat === null,
    planned: needed.length > 0 && !needed.some((t) => heldOrPlanned[t]),
  }
}

/** The target-cycle intake with the soonest future deadline. Term-only intakes match on cycle + term. */
export function matchingIntake(
  intakes: Intake[],
  profile: Pick<MatchProfile, "target_cycle" | "target_term">,
  now: Date
): { intake: Intake; next_deadline: Deadline } | { reason: string } {
  const today = now.toISOString().slice(0, 10)
  const inCycle = intakes.filter(
    (i) => i.cycle === profile.target_cycle && (profile.target_term === null || i.start_term === profile.target_term)
  )
  if (inCycle.length === 0) return { reason: `No intake in ${profile.target_cycle}` }
  const options = inCycle.flatMap((intake) =>
    ((intake.deadlines ?? []) as Deadline[])
      .filter((d) => d.date > today)
      .map((next_deadline) => ({ intake, next_deadline }))
  )
  if (options.length === 0) return { reason: "Every deadline for this intake has passed" }
  return options.sort((a, b) => a.next_deadline.date.localeCompare(b.next_deadline.date))[0]!
}

function staleRecord(bundle: Bundle, intake: Intake, now: Date): string | null {
  const records = { programme: bundle.programme, requirement: bundle.requirement, intake, fee: bundle.fee }
  for (const [name, record] of Object.entries(records)) {
    if (!record) return `No ${name} record`
    const age = (now.getTime() - new Date(record.last_verified_at).getTime()) / DAY_MS
    if (age > FRESHNESS_DAYS) return `The ${name} record was last verified ${Math.floor(age)} days ago`
  }
  return null
}

/** Stage 1. Visa restriction wins over every other outcome: the student must always be told. */
export function hardFilter(
  bundle: Bundle,
  profile: MatchProfile,
  academics: Academics,
  catalogue: Catalogue,
  options: MatchOptions
): FilterOutcome {
  const excluded = (filter: string, reason: string): FilterOutcome => ({ status: "excluded", filter, reason })
  if (bundle.programme.is_demo && !options.demoMode) return excluded("demo", "Demo record")
  // Field comes first, so the restricted list only shows programmes the student actually wants.
  const field = fieldMatch(bundle.programme, profile)
  if (field === "none") return excluded("field", `Not in ${profile.field}`)

  const restriction = visaRestriction(bundle.university.country, profile, catalogue, options)
  if (restriction) {
    return {
      status: "restricted",
      reason: restriction.description,
      source_url: restriction.source_url,
      review_due: restriction.review_due,
    }
  }

  const { requirement } = bundle
  if (!requirement) return excluded("freshness", "No requirement record")
  const academic = academicCheck(requirement, profile, academics)
  if (!academic.passes) return excluded("academic", `Needs ${requirement.min_uk_class} or above`)

  const english: ReturnType<typeof englishCheck> = profile.quick_match
    ? { result: "pass", unknown: true, planned: [] }
    : englishCheck(requirement, profile)
  if (english.result === "fail") return excluded("english", "No accepted English result or waiver")

  const tests: ReturnType<typeof admissionTestCheck> = profile.quick_match
    ? { passes: true, unknown: true, planned: false }
    : admissionTestCheck(requirement, profile)
  if (!tests.passes) return excluded("admission_tests", tests.reason!)

  const intakeMatch = matchingIntake(bundle.intakes, profile, options.now)
  if ("reason" in intakeMatch) return excluded("intake", intakeMatch.reason)

  const stale = staleRecord(bundle, intakeMatch.intake, options.now)
  if (stale) return excluded("freshness", stale)

  const costed = totalCost(bundle, intakeMatch.intake, profile, catalogue, options)
  if ("missing" in costed) return excluded("cost_data", costed.missing)
  const { cost } = costed
  if (
    profile.budget_total_minor !== null &&
    !withinCeiling(cost.total_ngn.market, BigInt(profile.budget_total_minor))
  ) {
    if (english.result !== "pass") return excluded("budget", "Total first-year cost is above 115% of the budget")
    return { status: "over_budget", cost, ...intakeMatch }
  }

  if (english.result === "needs_test") return { status: "needs_english", tests_planned: english.planned, cost }

  const flags: MatchFlag[] = []
  if (tests.unknown) flags.push("check_test_requirement")
  if (tests.planned) flags.push("planned_test_counted")
  if (english.unknown) flags.push("check_english_requirement")
  if (academics.source === "estimated") flags.push("grades_estimated")
  if (bundle.fee && bundle.fee.fee_year !== profile.target_cycle) flags.push("older_fee_year")
  if (field === "related") flags.push("related_field")
  return { status: "passed", cost, ...intakeMatch, reach: academic.reach, headroom: academic.headroom, flags }
}
