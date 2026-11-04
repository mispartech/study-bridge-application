// @vitest-environment node
import { describe, expect, it } from "vitest"

import demo from "@/tests/fixtures/demo-catalogue.json"

import {
  academicFit,
  admissionTestCheck,
  affordability,
  applyDiversity,
  budgetFit,
  bundles,
  englishCheck,
  groupFor,
  hardFilter,
  matchProfile,
  nigeriaRuleMinimum,
  normaliseAcademics,
  rank,
  ruleOn,
  totalCost,
  visaApplicationDate,
  withinCeiling,
  type Catalogue,
  type MatchProfile,
  type RankedProgramme,
} from "."

const NOW = new Date("2026-11-04T12:00:00Z")
const OPTIONS = { now: NOW, demoMode: true }
const catalogue = demo as unknown as Catalogue
const KOBO = 100
const fresh = () => structuredClone(catalogue)

/** Worked example from docs/SPEC_B4.md. */
const worked = (over: Partial<MatchProfile> = {}): MatchProfile =>
  matchProfile.parse({
    nationality: "NG",
    degree_class: "upper_second",
    cgpa: 3.8,
    cgpa_scale: 5,
    field: "computer_data_science",
    ielts: 7,
    budget_total_minor: 40_000_000 * KOBO,
    target_cycle: "2027/28",
    target_term: "fall",
    accommodation_pref: "university_halls",
    ...over,
  })
/** Same student with no budget limit, so one filter at a time can be tested. */
const rich = (over: Partial<MatchProfile> = {}) => worked({ budget_total_minor: 1_000_000_000 * KOBO, ...over })

function find(c: Catalogue, title: string, university?: string) {
  const programme = c.programmes.find((p) => {
    const uni = c.universities.find((u) => u.id === p.university_id)!
    return p.title === title && (!university || uni.name.includes(university))
  })
  if (!programme) throw new Error(`No demo programme ${title}`)
  return {
    programme,
    requirement: c.requirements.find((r) => r.programme_id === programme.id)!,
    intakes: c.intakes.filter((i) => i.programme_id === programme.id),
    fee: c.fees.find((f) => f.programme_id === programme.id)!,
  }
}

const NORTHMOOR_AI = "MSc Demo Artificial Intelligence"
const THAMESBANK_DS = "MSc Demo Data Science"

function outcome(profile: MatchProfile, title: string, c: Catalogue = catalogue, options = OPTIONS) {
  const bundle = bundles(c, options.demoMode).find((b) => b.programme.title === title)!
  return hardFilter(bundle, profile, normaliseAcademics(profile, c.gradeMappings), c, options)
}

describe("normaliseAcademics", () => {
  const map = catalogue.gradeMappings
  const base = { degree_class: null, cgpa: null, cgpa_scale: null, hnd_pgd: false }

  it("uses a stated degree class", () => {
    expect(normaliseAcademics({ ...base, degree_class: "upper_second" }, map)).toMatchObject({
      band: "upper_second",
      source: "stated",
      gpa4: 3.3,
      percent: 65,
    })
  })
  it.each([
    [4.6, 5, "first"],
    [3.8, 5, "upper_second"],
    [2.4, 5, "lower_second"],
    [3.2, 4, "upper_second"],
    [1.2, 4, "third"],
  ] as const)("maps CGPA %s on a %s scale to %s, labelled estimated", (cgpa, cgpa_scale, band) => {
    expect(normaliseAcademics({ ...base, cgpa, cgpa_scale }, map)).toMatchObject({ band, source: "estimated" })
  })
  it("treats HND + PGD as one band below the stated class", () => {
    const result = normaliseAcademics({ ...base, degree_class: "upper_second", hnd_pgd: true }, map)
    expect(result).toMatchObject({ band: "lower_second", source: "estimated" })
  })
  it("returns no band when nothing is known", () => {
    expect(normaliseAcademics(base, map).band).toBeNull()
  })
  it("reads the minimum for the student's scale from a Nigeria rule", () => {
    const rule = "Demo rule: CGPA 3.50/5.0 or 3.00/4.0 from a recognised Nigerian university."
    expect(nigeriaRuleMinimum(rule, 5)).toBe(3.5)
    expect(nigeriaRuleMinimum(rule, 4)).toBe(3)
    expect(nigeriaRuleMinimum("Contact admissions", 5)).toBeNull()
  })
})

describe("visa filter", () => {
  it("never shows a Nigerian national US programmes in ranked results", () => {
    const result = rank(rich(), catalogue, OPTIONS)
    expect(result.ranked.filter((r) => r.bundle.university.country === "US")).toEqual([])
    expect(result.restricted.map((r) => r.bundle.university.country)).toEqual(Array(8).fill("US"))
  })
  it("gives the reason and source for a restriction", () => {
    const { restricted } = rank(rich(), catalogue, OPTIONS)
    expect(restricted[0]!.reason).toContain("Proclamation 10998")
    expect(restricted[0]!.source_url).toContain("whitehouse.gov")
    expect(restricted[0]!.review_due).toBe("2026-12-27")
  })
  it("lets a nationality with no rule see US programmes", () => {
    const result = rank(rich({ nationality: "GH" }), catalogue, OPTIONS)
    expect(result.restricted).toEqual([])
    expect(result.ranked.some((r) => r.bundle.university.country === "US")).toBe(true)
  })
  it("matches the PS row on travel document, not nationality", () => {
    const palestinian = rich({ nationality: "JO", travel_document: "PS" })
    expect(rank(palestinian, catalogue, OPTIONS).restricted).toHaveLength(8)
    expect(rank(rich({ nationality: "PS", travel_document: null }), catalogue, OPTIONS).restricted).toEqual([])
  })
  it("ignores a restriction that has ended", () => {
    const c = fresh()
    for (const r of c.visaRules) if (r.rule_type === "nationality_restriction") r.effective_to = "2026-06-01"
    expect(rank(rich(), c, OPTIONS).restricted).toEqual([])
  })
})

describe("academic filter", () => {
  it("excludes a band below the minimum", () => {
    const profile = rich({ degree_class: "lower_second", cgpa: 3.0 })
    expect(outcome(profile, NORTHMOOR_AI)).toMatchObject({ status: "excluded", filter: "academic" })
  })
  it("lets one band below through as Reach with 2 years' work where the programme allows it", () => {
    const profile = rich({ degree_class: "lower_second", cgpa: 3.0, work_years: 2 })
    expect(outcome(profile, NORTHMOOR_AI)).toMatchObject({ status: "passed", reach: true })
  })
  it("doesn't with under 2 years' work", () => {
    const profile = rich({ degree_class: "lower_second", cgpa: 3.0, work_years: 1.5 })
    expect(outcome(profile, NORTHMOOR_AI)).toMatchObject({ status: "excluded", filter: "academic" })
  })
  it("doesn't when the programme doesn't consider lower grades", () => {
    const c = fresh()
    find(c, NORTHMOOR_AI).requirement.considers_lower_with_experience = false
    const profile = rich({ degree_class: "lower_second", cgpa: 3.0, work_years: 5 })
    expect(outcome(profile, NORTHMOOR_AI, c)).toMatchObject({ status: "excluded", filter: "academic" })
  })
  it("lets the university's Nigeria rule override the estimate, both ways", () => {
    const c = fresh()
    const { requirement } = find(c, NORTHMOOR_AI)
    requirement.nigeria_rule = "CGPA 3.70/5.0"
    requirement.considers_lower_with_experience = false
    expect(outcome(rich({ degree_class: "upper_second", cgpa: 3.6 }), NORTHMOOR_AI, c).status).toBe("excluded")
    expect(outcome(rich({ degree_class: "lower_second", cgpa: 3.8 }), NORTHMOOR_AI, c).status).toBe("passed")
  })
  it("excludes a student with no grades", () => {
    const profile = rich({ degree_class: null, cgpa: null, cgpa_scale: null })
    expect(outcome(profile, NORTHMOOR_AI)).toMatchObject({ status: "excluded", filter: "academic" })
  })
})

describe("English filter", () => {
  const { requirement } = find(catalogue, NORTHMOOR_AI) // IELTS 6.5, TOEFL 90, Duolingo 110, PTE 58
  const with1to6 = { ...requirement, toefl_entries: [{ scale: "1-6", overall_min: 4.5, subscore_min: null }] }
  const none = { ielts: null }
  const result = (over: Partial<MatchProfile>, r = requirement) => englishCheck(r, rich({ ...none, ...over })).result

  it("passes on any one sufficient score", () => {
    expect(result({ ielts: 6.5 })).toBe("pass")
    expect(result({ duolingo: 110 })).toBe("pass")
    expect(result({ pte: 58 })).toBe("pass")
    expect(result({ toefl: 90, toefl_scale: "0-120" })).toBe("pass")
  })
  it("fails on scores below every minimum", () => {
    expect(result({ ielts: 6, pte: 50 })).toBe("fail")
  })
  it("compares TOEFL on the student's own scale only", () => {
    expect(result({ toefl: 100, toefl_scale: "0-120" }, with1to6)).toBe("fail")
    expect(result({ toefl: 4.5, toefl_scale: "1-6" }, with1to6)).toBe("pass")
    expect(result({ toefl: 4.5, toefl_scale: "1-6" })).toBe("fail")
  })
  it("accepts a WAEC credit where the programme accepts WAEC, and nothing weaker", () => {
    expect(result({ waec_english_grade: "C6" })).toBe("pass")
    expect(result({ waec_english_grade: "D7" })).toBe("fail")
    expect(result({ waec_english_grade: "C6" }, { ...requirement, waec_english_accepted: false })).toBe("fail")
  })
  it("accepts an English-medium degree only where the waiver text allows it", () => {
    const waiver = { ...requirement, english_waiver_text: "Degree taught in English in the last 2 years." }
    expect(result({ english_medium_degree: true }, waiver)).toBe("pass")
    expect(result({ english_medium_degree: true })).toBe("fail")
  })
  it("shows planned-but-not-taken tests as Needs English test, outside ranked results", () => {
    const profile = rich({ ...none, tests_planned: ["ielts"] })
    expect(outcome(profile, NORTHMOOR_AI).status).toBe("needs_english")
    const matched = rank(profile, catalogue, OPTIONS)
    expect(matched.ranked).toEqual([])
    expect(matched.needs_english.length).toBeGreaterThan(0)
  })
  it("passes with a check flag when no English requirement is recorded", () => {
    const blank = {
      ...requirement,
      ielts_min: null,
      duolingo_min: null,
      pte_min: null,
      toefl_entries: [],
    }
    expect(englishCheck(blank, rich(none))).toMatchObject({ result: "pass", unknown: true })
  })
})

describe("admission tests", () => {
  const { requirement } = find(catalogue, NORTHMOOR_AI)
  const check = (gre_status: string | null, gmat_status: string | null, held: Partial<MatchProfile>) =>
    admissionTestCheck({ ...requirement, gre_status, gmat_status } as typeof requirement, {
      gre: null,
      gmat: null,
      tests_planned: [],
      ...held,
    })
  const GMAT = { gmat: 650 }
  const GRE = { gre: 310 }

  it.each([
    ["GMAT-only student, GMAT required", "not_required", "required", GMAT, true],
    ["GMAT-only student, GRE required", "required", "not_required", GMAT, false],
    ["GRE-only student, GRE required", "required", "not_required", GRE, true],
    ["GRE-only student, GMAT required", "not_required", "required", GRE, false],
    ["no tests, GRE required", "required", "not_required", {}, false],
    ["no tests, nothing required", "not_required", "not_required", {}, true],
    ["both held, both required", "required", "required", { ...GRE, ...GMAT }, true],
    ["one held, both required", "required", "required", GRE, false],
    ["GRE planned only, GRE required", "required", "not_required", { tests_planned: ["gre"] }, true],
    ["one_of_required, GMAT held", "one_of_required", "one_of_required", GMAT, true],
    ["one_of_required, GRE held", "one_of_required", "one_of_required", GRE, true],
    ["one_of_required, one planned", "one_of_required", "one_of_required", { tests_planned: ["gmat"] }, true],
    ["one_of_required, neither", "one_of_required", "one_of_required", {}, false],
    ["GRE required + GMAT one_of_required, GRE held", "required", "one_of_required", GRE, true],
    ["GRE required + GMAT one_of_required, GMAT held", "required", "one_of_required", GMAT, false],
    ["optional never excludes", "optional", "optional", {}, true],
  ] as const)("%s", (_, gre, gmat, held, passes) => {
    expect(check(gre, gmat, held as Partial<MatchProfile>).passes).toBe(passes)
  })
  it("passes an unknown status but flags it", () => {
    expect(check(null, "not_required", {})).toMatchObject({ passes: true, unknown: true })
    const c = fresh()
    find(c, NORTHMOOR_AI).requirement.gre_status = null
    const passed = outcome(rich(), NORTHMOOR_AI, c)
    expect(passed).toMatchObject({ status: "passed" })
    expect(passed.status === "passed" && passed.flags).toContain("check_test_requirement")
  })
})

describe("budget ceiling", () => {
  const total = () => {
    const passed = outcome(rich(), NORTHMOOR_AI)
    if (passed.status !== "passed") throw new Error("expected pass")
    return passed.cost.total_ngn.market
  }

  it("passes at exactly 115% and fails at 115.01%", () => {
    expect(withinCeiling(11_500n, 10_000n)).toBe(true)
    expect(withinCeiling(11_501n, 10_000n)).toBe(false)
  })
  it("applies the ceiling to a real demo programme at the kobo boundary", () => {
    const cost = total()
    const budget = (cost * 100n + 114n) / 115n // smallest budget whose 115% covers the cost
    expect(outcome(rich({ budget_total_minor: Number(budget) }), NORTHMOOR_AI).status).toBe("passed")
    expect(outcome(rich({ budget_total_minor: Number(budget - 1n) }), NORTHMOOR_AI)).toMatchObject({
      status: "excluded",
      filter: "budget",
    })
  })
  it("labels affordability at each boundary", () => {
    expect(affordability(10_000n, 10_000n)).toBe("within")
    expect(affordability(10_001n, 10_000n)).toBe("stretch")
    expect(affordability(11_500n, 10_000n)).toBe("stretch")
    expect(affordability(11_501n, 10_000n)).toBe("out_of_reach")
    expect(affordability(1n, null)).toBe("unknown")
  })
  it("skips the ceiling when the budget isn't known yet", () => {
    expect(outcome(worked({ budget_total_minor: null }), NORTHMOOR_AI).status).toBe("passed")
  })
})

describe("intake filter", () => {
  it("excludes an intake whose deadlines have all passed", () => {
    const c = fresh()
    for (const i of find(c, NORTHMOOR_AI).intakes) i.deadlines = [{ label: "international", date: "2026-11-04" }]
    expect(outcome(rich(), NORTHMOOR_AI, c)).toMatchObject({ status: "excluded", filter: "intake" })
  })
  it("keeps it while one deadline is still ahead, and reports that one", () => {
    const c = fresh()
    find(c, NORTHMOOR_AI).intakes[0]!.deadlines = [
      { label: "round 1", date: "2026-10-01" },
      { label: "round 2", date: "2027-03-01" },
    ]
    expect(outcome(rich(), NORTHMOOR_AI, c)).toMatchObject({ next_deadline: { label: "round 2" } })
  })
  it("matches a term-only intake (fall, null month) to a 2027/28 target", () => {
    const c = fresh()
    find(c, NORTHMOOR_AI).intakes[0]!.start_month = null
    expect(outcome(rich(), NORTHMOOR_AI, c)).toMatchObject({ status: "passed", intake: { start_month: null } })
  })
  it("doesn't match a term-only intake to another term", () => {
    const c = fresh()
    find(c, NORTHMOOR_AI).intakes[0]!.start_month = null
    expect(outcome(rich({ target_term: "winter" }), NORTHMOOR_AI, c)).toMatchObject({ filter: "intake" })
  })
  it("excludes another cycle", () => {
    expect(outcome(rich({ target_cycle: "2028/29" }), NORTHMOOR_AI)).toMatchObject({ filter: "intake" })
  })
  it("accepts any term when the student hasn't chosen one", () => {
    expect(outcome(rich({ target_term: null }), NORTHMOOR_AI).status).toBe("passed")
  })
})

describe("data freshness", () => {
  const verifiedDaysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

  it("excludes a stale record (> 120 days)", () => {
    const c = fresh()
    find(c, NORTHMOOR_AI).programme.last_verified_at = verifiedDaysAgo(121)
    expect(outcome(rich(), NORTHMOOR_AI, c)).toMatchObject({ status: "excluded", filter: "freshness" })
  })
  it("keeps a record exactly 120 days old", () => {
    const c = fresh()
    find(c, NORTHMOOR_AI).programme.last_verified_at = verifiedDaysAgo(120)
    expect(outcome(rich(), NORTHMOOR_AI, c).status).toBe("passed")
  })
  it.each(["requirement", "fee", "intake"] as const)("checks the %s record too", (record) => {
    const c = fresh()
    const found = find(c, NORTHMOOR_AI)
    const row = record === "intake" ? found.intakes[0]! : found[record]
    row.last_verified_at = verifiedDaysAgo(121)
    expect(outcome(rich(), NORTHMOOR_AI, c)).toMatchObject({ filter: "freshness" })
  })
  it("drops the demo programmes the seed marks as stale", () => {
    const stale = rank(rich(), catalogue, OPTIONS).excluded.filter((e) => e.filter === "freshness")
    expect(stale.length).toBeGreaterThan(0)
  })
})

describe("demo data", () => {
  it("hides is_demo records unless demo mode is on", () => {
    const result = rank(rich(), catalogue, { now: NOW, demoMode: false })
    expect(result.ranked).toEqual([])
    expect(result.restricted).toEqual([])
    expect(bundles(catalogue, false)).toEqual([])
    expect(bundles(catalogue, true)).toHaveLength(30)
  })
})

describe("cost engine", () => {
  const costOf = (title: string, c: Catalogue = catalogue, profile = rich()) => {
    const bundle = bundles(c, true).find((b) => b.programme.title === title)!
    const intake = bundle.intakes.find((i) => i.start_term === "fall")!
    const costed = totalCost(bundle, intake, profile, c, OPTIONS)
    if ("missing" in costed) throw new Error(costed.missing)
    return costed.cost
  }

  it("adds up a UK programme by hand", () => {
    // Manchester halls: tuition 28,600 + rent 725 × 12 + living 380 × 12 + visa 524 + IHS 776 + flights 700
    const cost = costOf(NORTHMOOR_AI)
    expect(cost.total_minor).toBe((28_600n + 8_700n + 4_560n + 524n + 776n + 700n) * 100n)
    expect(cost.currency).toBe("GBP")
  })
  it("converts to NGN at both rate kinds", () => {
    const cost = costOf(NORTHMOOR_AI)
    expect(cost.total_ngn.official).toBe((cost.total_minor * 19_439_800n) / 10_000n)
    expect(cost.total_ngn.market).toBe(cost.total_minor * 2015n)
  })
  it("caps living costs at 12 months for a longer programme", () => {
    const rent = costOf("MEng Demo Electrical Engineering").lines.find((l) => l.key === "rent")!
    expect(rent.label).toBe("Rent for 12 months")
  })
  it("updates when accommodation changes, in under 200 ms", () => {
    const started = performance.now()
    const halls = costOf(NORTHMOOR_AI).total_minor
    const shared = costOf(NORTHMOOR_AI, catalogue, rich({ accommodation_pref: "shared_flat" })).total_minor
    expect(shared).toBeLessThan(halls)
    expect(performance.now() - started).toBeLessThan(200)
  })
  it("falls back to the cheapest accommodation and says so", () => {
    const cost = costOf(NORTHMOOR_AI, catalogue, rich({ accommodation_pref: "homestay" }))
    expect(cost).toMatchObject({ accommodation: "shared_flat", accommodation_available: false })
  })
  it("adds a deposit only when it doesn't count towards tuition", () => {
    const c = fresh()
    expect(costOf(NORTHMOOR_AI, c).lines.some((l) => l.key === "deposit")).toBe(false)
    find(c, NORTHMOOR_AI).intakes.forEach((i) => (i.deposit_credited_to_tuition = false))
    expect(costOf(NORTHMOOR_AI, c).lines.some((l) => l.key === "deposit")).toBe(true)
  })
  it("shows a missing FX rate as a data gap, not a guess", () => {
    const c = fresh()
    c.fxRates = c.fxRates.filter((r) => r.base !== "GBP")
    expect(outcome(rich(), NORTHMOOR_AI, c)).toMatchObject({ status: "excluded", filter: "cost_data" })
  })
  it("picks rules for the visa application date, 3 months before the start", () => {
    const fall = find(catalogue, NORTHMOOR_AI).intakes[0]!
    expect(visaApplicationDate(fall)).toBe("2027-06-01")
    expect(visaApplicationDate({ ...fall, start_month: null })).toBe("2027-05-01")
  })
  it("applies the UK maintenance increase of 30 Nov 2026", () => {
    const lookup = (date: string) =>
      ruleOn(catalogue.visaRules, { country: "UK", type: "proof_of_funds", region: "London", demoMode: true }, date)
    expect(lookup("2026-11-29")?.value).toMatchObject({ monthly_gbp: 1529 })
    expect(lookup("2026-11-30")?.value).toMatchObject({ monthly_gbp: 1570 })
  })
  it("applies the Graduate Route change of 1 Jan 2027", () => {
    const lookup = (date: string) =>
      ruleOn(catalogue.visaRules, { country: "UK", type: "post_study_work", demoMode: true }, date)
    expect(lookup("2026-12-31")?.value).toMatchObject({ months: 24 })
    expect(lookup("2027-01-01")?.value).toMatchObject({ months: 18 })
  })
  it("uses the London and outside-London proof-of-funds figures", () => {
    expect(costOf(THAMESBANK_DS).proof_of_funds_minor).toBe((31_500n + 1570n * 9n) * 100n)
    expect(costOf(NORTHMOOR_AI).proof_of_funds_minor).toBe((28_600n + 1203n * 9n) * 100n)
  })
  it("uses Canada's single-applicant amount, plus family and travel", () => {
    const title = "MEng Demo Ocean Engineering"
    expect(costOf(title).proof_of_funds_minor).toBe((23_900n + 23_448n + 1800n) * 100n)
    const family = costOf(title, catalogue, rich({ dependants: 1 })).proof_of_funds_minor
    expect(family).toBe((23_900n + 23_448n + 6318n + 1800n) * 100n)
  })
  it("uses the Quebec figure for a Quebec university", () => {
    expect(costOf("MSc Demo Applied Data Science").proof_of_funds_minor).toBe((29_500n + 24_617n + 1800n) * 100n)
  })
})

describe("fit score", () => {
  it("scores academic headroom", () => {
    expect([academicFit(2, false), academicFit(1, false), academicFit(0, false), academicFit(0, true)]).toEqual([
      1, 0.8, 0.6, 0.3,
    ])
  })
  it("scores budget from 1.0 at 70% down to 0 at 115%", () => {
    expect(budgetFit(70n, 100)).toBe(1)
    expect(budgetFit(50n, 100)).toBe(1)
    expect(budgetFit(115n, 100)).toBeCloseTo(0)
    expect(budgetFit(925n, 1000)).toBeCloseTo(0.5)
  })
  const passedScores = (profile: MatchProfile, title: string, c: Catalogue = catalogue) =>
    rank(profile, c, OPTIONS).ranked.find((r) => r.bundle.programme.title === title)!.scores

  it("adds up with the default weights", () => {
    const s = passedScores(rich(), NORTHMOOR_AI)
    expect(s.A).toBe(0.6)
    expect(s.C).toBe(0.8) // field match + longest post-study work
    expect(s.O).toBe(0.5) // no outcome data
    expect(s.fit).toBeGreaterThan(0)
    expect(s.fit).toBeLessThanOrEqual(100)
  })
  it("uses the student's own weights", () => {
    const weights = { A: 100, B: 0, C: 0, L: 0, S: 0, O: 0 }
    expect(passedScores(rich({ weights }), NORTHMOOR_AI).fit).toBe(60)
  })
  it("rejects weights that don't sum to 100", () => {
    const body = { target_cycle: "2027/28", weights: { A: 50, B: 0, C: 0, L: 0, S: 0, O: 0 } }
    expect(matchProfile.safeParse(body).success).toBe(false)
  })
  it("gives co-op credit in career fit, and none without a field match", () => {
    const coop = passedScores(rich({ field: "engineering" }), "MEng Demo Electrical Engineering")
    expect(coop.C).toBe(0.8) // field match + co-op; Canada has no post-study work row yet
    const other = passedScores(rich({ field: "law" }), "MEng Demo Civil Engineering")
    expect(other.C).toBe(0.4) // co-op + longest post-study work, no field match
  })
  it("scores a preferred city above a preferred country", () => {
    const city = passedScores(rich({ preferred_cities: ["Manchester"] }), NORTHMOOR_AI)
    const country = passedScores(rich({ preferred_countries: ["UK"] }), NORTHMOOR_AI)
    expect(city.L).toBe(1)
    expect(country.L).toBe(0.7)
  })
  it("scores open, eligible scholarships and ignores expired ones", () => {
    const s = passedScores(rich(), NORTHMOOR_AI)
    expect(s.S).toBeCloseTo((5000 * 1) / (28_600 / 2), 1)
    const c = fresh()
    c.scholarships = c.scholarships.map((x) => ({ ...x, deadline: "2026-01-01" }))
    expect(passedScores(rich(), NORTHMOOR_AI, c).S).toBe(0)
  })
  it("caps scholarships with no fixed amount at 1.0 for those eligible", () => {
    const profile = rich({ degree_class: "first", cgpa: 4.7 })
    expect(passedScores(profile, NORTHMOOR_AI).S).toBe(1)
  })
})

describe("grouping", () => {
  it.each([
    [75, false, "within", "strong"],
    [74.9, false, "within", "good"],
    [80, false, "stretch", "good"],
    [55, false, "stretch", "good"],
    [54.9, false, "within", "reach"],
    [90, true, "within", "reach"],
  ] as const)("fit %s, reach %s, %s → %s", (fit, reach, affordable, group) => {
    expect(groupFor(fit, reach, { affordability: affordable })).toBe(group)
  })
})

describe("diversity", () => {
  const fakeRanked = (university: string, country: string, fit: number) =>
    ({ bundle: { university: { id: university, country } }, scores: { fit } }) as RankedProgramme
  const uniOf = (r: RankedProgramme) => r.bundle.university.id

  it("caps one university at 4 in the top 20, on 10 demo programmes from one university", () => {
    const c = fresh()
    const home = c.universities.find((u) => u.name.includes("Clydeside"))!
    const extras = c.programmes.filter((p) => p.university_id !== home.id).slice(0, 8)
    for (const p of extras) p.university_id = home.id
    const owned = c.programmes.filter((p) => p.university_id === home.id)
    expect(owned).toHaveLength(10)

    const { ranked, more } = rank(rich({ nationality: "GH", ielts: 8, gre: 320, gmat: 700 }), c, OPTIONS)
    const fromHome = (list: RankedProgramme[]) => list.filter((r) => r.bundle.university.id === home.id).length
    expect(fromHome(ranked)).toBe(4)
    expect(fromHome(more)).toBeGreaterThan(0)
  })
  it("keeps programmes pushed out of the top 20 after it", () => {
    const sorted = Array.from({ length: 6 }, (_, i) => fakeRanked("a", "UK", 90 - i))
    const { top, rest } = applyDiversity(sorted, [])
    expect(top.map(uniOf)).toEqual(["a", "a", "a", "a"])
    expect(rest).toHaveLength(2)
  })
  it("brings in a second country when the student chose more than one", () => {
    const uk = Array.from({ length: 20 }, (_, i) => fakeRanked(`uk${i}`, "UK", 90 - i))
    const { top } = applyDiversity([...uk, fakeRanked("ca", "CA", 10)], ["UK", "CA"])
    expect(new Set(top.map((r) => r.bundle.university.country))).toEqual(new Set(["UK", "CA"]))
    expect(top).toHaveLength(20)
  })
  it("doesn't force a second country the student didn't choose", () => {
    const uk = Array.from({ length: 20 }, (_, i) => fakeRanked(`uk${i}`, "UK", 90 - i))
    const { top } = applyDiversity([...uk, fakeRanked("ca", "CA", 10)], ["UK"])
    expect(top.every((r) => r.bundle.university.country === "UK")).toBe(true)
  })
})

describe("worked example", () => {
  const result = rank(worked(), catalogue, OPTIONS)

  it("filters the US out for nationality", () => {
    expect(result.restricted).toHaveLength(8)
    expect(result.ranked.some((r) => r.bundle.university.country === "US")).toBe(false)
  })
  it("reads the student as a 2:1", () => {
    expect(result.academics.band).toBe("upper_second")
  })
  it("accounts for all 30 demo programmes", () => {
    const counted =
      result.ranked.length +
      result.more.length +
      result.restricted.length +
      result.needs_english.length +
      result.excluded.length
    expect(counted).toBe(30)
  })
  it("prints the results when asked", () => {
    if (!process.env.PRINT_WORKED_EXAMPLE) return
    const naira = (kobo: bigint) => `₦${(Number(kobo / 100n) / 1_000_000).toFixed(1)}m`
    const budgets = [40, 60, 70, 80]
    for (const millions of budgets) {
      const r = rank(worked({ budget_total_minor: millions * 1_000_000 * KOBO }), catalogue, OPTIONS)
      console.log(`\n=== Budget ₦${millions}m: ${r.ranked.length} ranked ===`)
      for (const m of r.ranked) {
        const { fit, A, B, C, L, S } = m.scores
        console.log(
          [
            String(fit).padStart(5),
            m.group.padEnd(6),
            m.cost.affordability.padEnd(8),
            naira(m.cost.total_ngn.market).padStart(8),
            `${m.bundle.university.city},${m.bundle.university.country}`.padEnd(14),
            `${m.bundle.programme.title} (${m.bundle.university.name.replace("Demo — ", "")})`,
            `A${A} B${B} C${C} L${L} S${S}`,
          ].join("  ")
        )
      }
      const reasons = new Map<string, number>()
      for (const e of r.excluded) reasons.set(e.filter, (reasons.get(e.filter) ?? 0) + 1)
      console.log("restricted", r.restricted.length, "excluded", Object.fromEntries(reasons))
    }
  })
})
