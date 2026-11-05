// @vitest-environment node
import { describe, expect, it } from "vitest"

import demo from "@/tests/fixtures/demo-catalogue.json"

import {
  academicFit,
  admissionTestCheck,
  affordability,
  applyDiversity,
  budgetFit,
  careerFit,
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
const THAMESBANK_HEALTH = "MSc Demo Global Public Health"

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
    const result = rank(rich({ field: null }), catalogue, OPTIONS)
    expect(result.ranked.filter((r) => r.bundle.university.country === "US")).toEqual([])
    expect(result.restricted.map((r) => r.bundle.university.country)).toEqual(Array(10).fill("US"))
  })
  it("gives the reason and source for a restriction", () => {
    const { restricted } = rank(rich(), catalogue, OPTIONS)
    expect(restricted[0]!.reason).toContain("Proclamation 10998")
    expect(restricted[0]!.source_url).toContain("whitehouse.gov")
    expect(restricted[0]!.review_due).toBe("2026-12-27")
  })
  it("lets a nationality with no rule see US programmes", () => {
    const result = rank(rich({ nationality: "GH", gre: 320 }), catalogue, OPTIONS)
    expect(result.restricted).toEqual([])
    expect(result.ranked.some((r) => r.bundle.university.country === "US")).toBe(true)
  })
  it("matches the PS row on travel document, not nationality", () => {
    const palestinian = rich({ nationality: "JO", travel_document: "PS" })
    expect(rank(palestinian, catalogue, OPTIONS).restricted).toHaveLength(4)
    expect(rank(rich({ nationality: "PS", travel_document: null }), catalogue, OPTIONS).restricted).toEqual([])
  })
  it("ignores a restriction that has ended", () => {
    const c = fresh()
    for (const r of c.visaRules) if (r.rule_type === "nationality_restriction") r.effective_to = "2026-06-01"
    expect(rank(rich(), c, OPTIONS).restricted).toEqual([])
  })
})

describe("quick match", () => {
  const quick = (over: Partial<MatchProfile> = {}) =>
    matchProfile.parse({
      quick_match: true,
      nationality: "NG",
      field: "computer_data_science",
      cgpa: 3.8,
      cgpa_scale: 5,
      budget_total_minor: 80_000_000 * KOBO,
      target_cycle: "2027/28",
      ...over,
    })

  it("ranks with only field, CGPA and budget", () => {
    expect(rank(quick(), catalogue, OPTIONS).ranked.length).toBeGreaterThanOrEqual(3)
  })
  it("still applies the visa filter", () => {
    const { ranked, restricted } = rank(quick(), catalogue, OPTIONS)
    expect(ranked.some((r) => r.bundle.university.country === "US")).toBe(false)
    expect(restricted.length).toBeGreaterThan(0)
  })
  it("flags the checks it left for later", () => {
    const flags = rank(quick(), catalogue, OPTIONS).ranked[0]!.flags
    expect(flags).toEqual(expect.arrayContaining(["check_test_requirement", "check_english_requirement"]))
  })
  it("doesn't skip those checks without the flag", () => {
    expect(rank(quick({ quick_match: false }), catalogue, OPTIONS).ranked).toEqual([])
  })
})

describe("field filter", () => {
  const titles = (profile: MatchProfile, c: Catalogue = catalogue) =>
    rank(profile, c, OPTIONS).ranked.map((r) => r.bundle.programme.title)
  const analytics = () => {
    const c = fresh()
    find(c, "MSc Demo Finance").programme.title = "MSc Demo Business Analytics"
    find(c, "MBA Demo Global Business").programme.title = "MBA Demo Artificial Intelligence Strategy"
    return c
  }

  it("excludes every other field", () => {
    expect(outcome(rich(), "LLM Demo Energy Law")).toMatchObject({ status: "excluded", filter: "field" })
    const ranked = rank(rich(), catalogue, OPTIONS).ranked
    expect(ranked.length).toBeGreaterThan(0)
    expect(ranked.every((r) => r.bundle.programme.field === "computer_data_science")).toBe(true)
  })
  it("keeps other fields out of the restricted list", () => {
    const { restricted } = rank(rich(), catalogue, OPTIONS)
    expect(restricted.every((r) => r.bundle.programme.field === "computer_data_science")).toBe(true)
  })
  it("doesn't filter before a field is chosen", () => {
    const fields = new Set(rank(rich({ field: null }), catalogue, OPTIONS).ranked.map((r) => r.bundle.programme.field))
    expect(fields.size).toBeGreaterThan(1)
  })
  it("leaves AI and analytics programmes under another field out by default", () => {
    expect(titles(rich(), analytics())).not.toContain("MSc Demo Business Analytics")
  })
  it("includes them with the related-fields option, flagged", () => {
    const c = analytics()
    const profile = rich({ include_related_fields: true })
    expect(titles(profile, c)).toEqual(
      expect.arrayContaining(["MSc Demo Business Analytics", "MBA Demo Artificial Intelligence Strategy"])
    )
    const related = rank(profile, c, OPTIONS).ranked.filter((r) => r.flags.includes("related_field"))
    expect(related.map((r) => r.bundle.programme.field)).not.toContain("computer_data_science")
    expect(related.length).toBeGreaterThan(0)
  })
  it("finds the demo Business Analytics programme with the option on", () => {
    expect(titles(rich())).not.toContain("MSc Demo Business Analytics")
    expect(
      rank(rich({ include_related_fields: true }), catalogue, OPTIONS)
        .more.concat(rank(rich({ include_related_fields: true }), catalogue, OPTIONS).ranked)
        .map((r) => r.bundle.programme.title)
    ).toContain("MSc Demo Business Analytics")
  })
  it("doesn't let the option pull in unrelated programmes", () => {
    expect(titles(rich({ include_related_fields: true }), analytics())).not.toContain("LLM Demo Energy Law")
  })
  it("has no related list yet for other fields", () => {
    const profile = rich({ field: "law", include_related_fields: true })
    expect(rank(profile, analytics(), OPTIONS).ranked.every((r) => r.bundle.programme.field === "law")).toBe(true)
  })
})

describe("near misses", () => {
  const at = (millions: number, over: Partial<MatchProfile> = {}) =>
    rank(worked({ budget_total_minor: millions * 1_000_000 * KOBO, ...over }), catalogue, OPTIONS)

  it("returns the ₦40m worked example's nearest programmes when nothing ranks", () => {
    const { ranked, near_misses } = at(40)
    expect(ranked).toEqual([])
    expect(near_misses.length).toBeGreaterThan(0)
    expect(near_misses.length).toBeLessThanOrEqual(5)
  })
  it("orders them by the NGN gap, smallest first", () => {
    const gaps = at(40).near_misses.map((n) => n.gap_ngn_minor)
    expect(gaps).toEqual([...gaps].sort((a, b) => Number(a - b)))
    expect(gaps[0]).toBeGreaterThan(0n)
  })
  it("measures the gap from the budget, at the market rate", () => {
    const [first] = at(40).near_misses
    expect(first!.gap_ngn_minor).toBe(first!.cost.total_ngn.market - BigInt(40_000_000 * KOBO))
  })
  it("lists eligible open scholarships only", () => {
    const names = at(40).near_misses.flatMap((n) => n.scholarships.map((s) => s.name))
    expect(names).toContain("Demo — Global Futures Scholarship")
    expect(names).not.toContain("Demo — Early Bird Grant") // closed
    expect(names).not.toContain("Demo — Africa Leaders Fund") // needs a First
  })
  it("caps the list at 5", () => {
    const result = rank(worked({ field: null, budget_total_minor: 20_000_000 * KOBO }), catalogue, OPTIONS)
    expect(result.ranked).toEqual([])
    expect(result.near_misses).toHaveLength(5)
  })
  it("leaves out programmes that fail another filter", () => {
    const misses = at(40).near_misses
    expect(misses.every((n) => n.bundle.university.country !== "US")).toBe(true) // restricted for Nigerian nationals
    expect(misses.some((n) => n.bundle.university.name.includes("Pacific Ridge"))).toBe(false) // GRE required
  })
  it("returns none once 3 or more rank", () => {
    const result = rank(worked({ field: null, budget_total_minor: 80_000_000 * KOBO }), catalogue, OPTIONS)
    expect(result.ranked.length).toBeGreaterThanOrEqual(3)
    expect(result.near_misses).toEqual([])
  })
  it("still returns them when 1 or 2 rank", () => {
    const { ranked, near_misses } = at(50)
    expect(ranked.length).toBeGreaterThan(0)
    expect(ranked.length).toBeLessThan(3)
    expect(near_misses.length).toBeGreaterThan(0)
  })
  it("keeps over-budget programmes in the excluded list too", () => {
    const { near_misses, excluded } = at(40)
    const budget = excluded.filter((e) => e.filter === "budget").map((e) => e.programme_id)
    for (const n of near_misses) expect(budget).toContain(n.bundle.programme.id)
  })
  it("needs a known budget", () => {
    expect(at(40, { budget_total_minor: null }).near_misses).toEqual([])
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
    expect(result({ waec_english_grade: "A1" })).toBe("pass")
    expect(result({ waec_english_grade: "D7" })).toBe("fail")
    expect(result({ waec_english_grade: "C6" }, { ...requirement, waec_english_accepted: false })).toBe("fail")
  })
  it("uses each requirement's own minimum WAEC grade", () => {
    const stricter = { ...requirement, waec_min_grade: "B3" }
    expect(result({ waec_english_grade: "B3" }, stricter)).toBe("pass")
    expect(result({ waec_english_grade: "C4" }, stricter)).toBe("fail")
  })
  it("gives no WAEC waiver when no grade is stated", () => {
    expect(result({ waec_english_grade: "A1" }, { ...requirement, waec_min_grade: null })).toBe("fail")
    expect(result({ waec_english_grade: null })).toBe("fail")
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
    expect(outcome(rich({ budget_total_minor: Number(budget - 1n) }), NORTHMOOR_AI).status).toBe("over_budget")
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
    expect(bundles(catalogue, true)).toHaveLength(41)
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
  it("marks visa fee, health cover and flights as estimated, and not tuition", () => {
    const lines = Object.fromEntries(costOf(NORTHMOOR_AI).lines.map((l) => [l.key, l]))
    expect(lines.visa_fee?.estimated).toBe(true)
    expect(lines.health_cover?.estimated).toBe(true)
    expect(lines.flights?.estimated).toBe(true)
    expect(lines.tuition?.estimated).toBe(false)
  })
  it("marks Canada's visa fee, health cover and flights as estimated", () => {
    const lines = costOf("MEng Demo Ocean Engineering").lines
    expect(
      lines.filter((l) => ["visa_fee", "health_cover", "flights"].includes(l.key)).map((l) => l.estimated)
    ).toEqual([true, true, true])
  })
  it("marks the US visa fee as estimated while its source is third party", () => {
    const profile = rich({ nationality: "GH" })
    const line = costOf("MS Demo Data Science", catalogue, profile).lines.find((l) => l.key === "visa_fee")!
    expect(line.estimated).toBe(true)
  })
  it("stops marking a figure once it comes from an official source", () => {
    const c = fresh()
    for (const r of c.visaRules) if (r.rule_type === "government_fee") r.confidence = "official"
    expect(costOf(NORTHMOOR_AI, c).lines.find((l) => l.key === "visa_fee")!.estimated).toBe(false)
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
    expect(costOf(THAMESBANK_HEALTH).proof_of_funds_minor).toBe((27_800n + 1570n * 9n) * 100n)
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
  it("gives co-op credit in career fit", () => {
    const coop = passedScores(rich({ field: "engineering" }), "MEng Demo Electrical Engineering")
    expect(coop.C).toBe(0.8) // field match + co-op; Canada has no post-study work row yet
  })
  it("gives no field credit to a related programme", () => {
    const c = fresh()
    find(c, "MSc Demo Finance").programme.title = "MSc Demo Business Analytics"
    const profile = rich({ include_related_fields: true, ielts: 7 })
    expect(passedScores(profile, "MSc Demo Business Analytics", c).C).toBe(0.2) // post-study work only
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
    const extras = c.programmes.filter((p) => p.university_id !== home.id).slice(0, 7)
    for (const p of extras) p.university_id = home.id
    const owned = c.programmes.filter((p) => p.university_id === home.id)
    expect(owned).toHaveLength(10)

    const { ranked, more } = rank(rich({ field: null, nationality: "GH", ielts: 8, gre: 320, gmat: 700 }), c, OPTIONS)
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
  const result = rank(worked({ budget_total_minor: 80_000_000 * KOBO }), catalogue, OPTIONS)

  it("filters the US out for nationality", () => {
    expect(result.restricted).toHaveLength(4)
    expect(result.ranked.some((r) => r.bundle.university.country === "US")).toBe(false)
  })
  it("reads the student as a 2:1", () => {
    expect(result.academics.band).toBe("upper_second")
  })
  it("puts a Canadian co-op programme first and London at Stretch", () => {
    const [first] = result.ranked
    expect(first!.bundle.university.country).toBe("CA")
    expect(first!.bundle.programme.has_coop_or_placement).toBe(true)
    const london = result.ranked.filter((r) => r.bundle.university.city === "London")
    expect(london.length).toBeGreaterThan(0)
    expect(london.every((r) => r.cost.affordability === "stretch")).toBe(true)
  })
  it("ranks UK programmes outside London within budget", () => {
    const outside = result.ranked.filter(
      (r) => r.bundle.university.country === "UK" && r.bundle.university.city !== "London"
    )
    expect(outside.some((r) => r.cost.affordability === "within")).toBe(true)
  })
  it("returns 5 near misses and no ranked results at ₦40m", () => {
    const low = rank(worked(), catalogue, OPTIONS)
    expect(low.ranked).toEqual([])
    expect(low.near_misses).toHaveLength(5)
  })
  it("accounts for all 41 demo programmes", () => {
    const counted =
      result.ranked.length +
      result.more.length +
      // near misses are also in excluded
      result.restricted.length +
      result.needs_english.length +
      result.excluded.length
    expect(counted).toBe(41)
  })
  it("prints the results when asked", () => {
    if (!process.env.PRINT_WORKED_EXAMPLE) return
    const naira = (kobo: bigint) => `₦${(Number(kobo / 100n) / 1_000_000).toFixed(1)}m`
    const budgets = [40, 80]
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
      for (const n of r.near_misses) {
        const uni = n.bundle.university
        console.log(
          `  near miss: ${naira(n.gap_ngn_minor)} over, total ${naira(n.cost.total_ngn.market)}, ` +
            `${n.bundle.programme.title} (${uni.name.replace("Demo — ", "")}, ${uni.city}); ` +
            `scholarships: ${n.scholarships.map((s) => s.name.replace("Demo — ", "")).join(", ") || "none"}`
        )
      }
      const reasons = new Map<string, number>()
      for (const e of r.excluded) reasons.set(e.filter, (reasons.get(e.filter) ?? 0) + 1)
      console.log("restricted", r.restricted.length, "excluded", Object.fromEntries(reasons))
    }
  })
})

describe("post-study work priority in career fit", () => {
  const options = { now: new Date("2026-11-05T12:00:00Z"), demoMode: true }
  const base = matchProfile.parse({
    nationality: "NG",
    field: "computer_data_science",
    target_cycle: "2027/28",
    preferred_countries: ["UK", "CA"],
  })
  const cat = demo as unknown as Catalogue
  const fit = (priority: "low" | "medium" | "high" | null, country: string) => {
    const bundle = bundles(cat, true).find(
      (b) => b.university.country === country && b.programme.field === base.field && !b.programme.has_coop_or_placement
    )!
    return careerFit(bundle, bundle.intakes[0]!, { ...base, post_study_work: priority }, cat, options)
  }

  it("keeps today's weights when the student gives no priority", () => {
    expect(fit(null, "UK")).toBeCloseTo(0.8)
    expect(fit(null, "CA")).toBeCloseTo(0.6)
  })

  it("rewards the longest route more when it's marked important", () => {
    expect(fit("high", "UK")).toBeGreaterThan(fit("medium", "UK"))
    const gap = (priority: "low" | "medium" | "high") => fit(priority, "UK") - fit(priority, "CA")
    expect(gap("high")).toBeGreaterThan(gap("medium"))
    expect(gap("medium")).toBeGreaterThan(gap("low"))
  })

  it("treats a country with no rule on file as unknown, not zero, once a priority is set", () => {
    expect(fit("medium", "CA")).toBeCloseTo(0.7)
    expect(fit("high", "CA")).toBeCloseTo(0.65)
  })
})
