// @vitest-environment node
import { describe, expect, it } from "vitest"

import { convertMinor, formatShort } from "@/lib/money"
import demo from "@/tests/fixtures/demo-catalogue.json"

import { completeness, emptyDraft, matchConfidence, parseProfileCookie, toMatchProfile, type Draft } from "./draft"
import { matchProfile, rank, type Catalogue } from "."
import { nextCycle } from "./labels"
import { isOfficialUrl } from "./official-url"
import { presentResult, ruleChange } from "./present"
import { applyViewFilters, NO_FILTERS } from "./view-filters"
import { rebalance } from "./weights"

const NOW = new Date("2026-11-05T12:00:00Z")
const catalogue = demo as unknown as Catalogue
const KOBO = 100
const profile = matchProfile.parse({
  nationality: "NG",
  degree_class: "upper_second",
  cgpa: 3.8,
  cgpa_scale: 5,
  field: "computer_data_science",
  ielts: 7,
  budget_total_minor: 80_000_000 * KOBO,
  target_cycle: "2027/28",
  target_term: "fall",
  accommodation_pref: "university_halls",
})
const view = presentResult(rank(profile, catalogue, { now: NOW, demoMode: true }), profile, catalogue, NOW)

describe("formatShort", () => {
  it.each([
    [5_940_000_000n, "NGN", "₦59.4m"],
    [8_000_000_000n, "NGN", "₦80m"],
    [95_000_000n, "NGN", "₦950k"],
    [3_480_000n, "GBP", "£34.8k"],
    [4_120_000n, "CAD", "CA$41.2k"],
    [6_120_000n, "USD", "US$61.2k"],
    [90_000n, "CAD", "CA$900"],
    [-2_500_000_000n, "NGN", "-₦25m"],
  ] as const)("%s %s → %s", (amount, currency, expected) => {
    expect(formatShort(amount, currency)).toBe(expected)
  })
  it("moves to millions rather than showing 1000k", () => {
    expect(formatShort(99_999_000n, "NGN")).toBe("₦1m")
  })
})

describe("convertMinor", () => {
  const rates = { GBP: 2015, CAD: 1130 }
  it("converts through NGN with database rates", () => {
    expect(convertMinor(100n, "GBP", "NGN", rates)).toBe(201_500n)
    expect(convertMinor(201_500n, "NGN", "GBP", rates)).toBe(100n)
    expect(convertMinor(11_300n, "CAD", "GBP", { GBP: 1130, CAD: 1130 })).toBe(11_300n)
  })
  it("leaves the same currency alone", () => {
    expect(convertMinor(5n, "USD", "USD", {})).toBe(5n)
  })
  it("returns null without a rate rather than guessing", () => {
    expect(convertMinor(100n, "USD", "NGN", rates)).toBeNull()
  })
})

describe("official apply links", () => {
  const domains = ["northmoor-demo.example"]
  it("accepts the domain and its subdomains", () => {
    expect(isOfficialUrl("https://northmoor-demo.example/apply", domains)).toBe(true)
    expect(isOfficialUrl("https://apply.northmoor-demo.example/x", domains)).toBe(true)
  })
  it("accepts a known application portal", () => {
    expect(isOfficialUrl("https://digital.ucas.com/x", domains)).toBe(true)
  })
  it.each([
    "https://northmoor-demo.example.evil.test/apply",
    "https://evilnorthmoor-demo.example/apply",
    "http://northmoor-demo.example/apply",
    "not a url",
    null,
  ])("rejects %s", (url) => {
    expect(isOfficialUrl(url, domains)).toBe(false)
  })
})

describe("weight sliders", () => {
  const weights = { A: 30, B: 25, C: 15, L: 10, S: 10, O: 10 }
  const total = (w: typeof weights) => Object.values(w).reduce((a, b) => a + b, 0)

  it.each([0, 1, 37, 50, 99, 100])("keeps the total at 100 when Grades is %i", (value) => {
    const next = rebalance(weights, "A", value)
    expect(next.A).toBe(value)
    expect(total(next)).toBe(100)
  })
  it("keeps the others in proportion", () => {
    const next = rebalance(weights, "A", 65)
    expect(next.B).toBeGreaterThan(next.C)
    expect(next.L).toBe(next.S)
  })
  it("shares out evenly when the others are all zero", () => {
    expect(total(rebalance({ A: 100, B: 0, C: 0, L: 0, S: 0, O: 0 }, "A", 50))).toBe(100)
  })
  it("always passes the API's sum check", () => {
    const next = rebalance(weights, "B", 44)
    expect(matchProfile.safeParse({ target_cycle: "2027/28", weights: next }).success).toBe(true)
  })
})

describe("view filters", () => {
  const titles = (filters: Partial<typeof NO_FILTERS>) => applyViewFilters(view.ranked, { ...NO_FILTERS, ...filters })

  it("keeps everything with no filters, in rank order", () => {
    expect(titles({})).toEqual(view.ranked)
  })
  it("filters by country and city", () => {
    expect(titles({ countries: ["CA"] }).every((c) => c.country === "CA")).toBe(true)
    expect(titles({ city: "Leeds" }).every((c) => c.city === "Leeds")).toBe(true)
  })
  it("filters by fee band", () => {
    const under = titles({ feeBand: "under_50m" })
    expect(under.length).toBeGreaterThan(0)
    expect(under.every((c) => BigInt(c.cost.total_ngn_market) < 5_000_000_000n)).toBe(true)
  })
  it("filters to co-op programmes and programmes with no GRE", () => {
    expect(titles({ coop: true }).every((c) => c.has_coop)).toBe(true)
    expect(titles({ noGre: true }).every((c) => c.no_gre)).toBe(true)
  })
  it("sorts by lowest cost", () => {
    const costs = titles({ sort: "cost" }).map((c) => BigInt(c.cost.total_ngn_market))
    expect(costs).toEqual([...costs].sort((a, b) => Number(a - b)))
  })
  it("sorts by soonest deadline", () => {
    const dates = titles({ sort: "deadline" }).map((c) => c.next_deadline.date)
    expect(dates).toEqual([...dates].sort())
  })
})

describe("presented results", () => {
  it("sends money as strings, so it survives JSON", () => {
    expect(typeof view.ranked[0]!.cost.total_ngn_market).toBe("string")
    expect(() => JSON.stringify(view)).not.toThrow()
  })
  it("marks demo estimates on every ranked card, and not the official visa fees", () => {
    for (const card of view.ranked) {
      const estimated = card.cost.lines.filter((l) => l.estimated).map((l) => l.key)
      expect(estimated).toContain("flights")
      expect(estimated).not.toContain("visa_fee")
    }
  })
  it("includes every FX rate the currency toggle needs", () => {
    expect(Object.keys(view.fx.market).sort()).toEqual(["CAD", "GBP", "USD"])
    expect(Object.keys(view.fx.official).sort()).toEqual(["CAD", "GBP", "USD"])
  })
  it("withholds an apply link that isn't on an official domain", () => {
    const c = structuredClone(catalogue)
    for (const p of c.programmes) p.apply_url = "https://agent.example/apply"
    const bad = presentResult(rank(profile, c, { now: NOW, demoMode: true }), profile, c, NOW)
    expect(bad.ranked[0]!.apply_url).toBeNull()
  })
  it("gives the restriction's reason and source", () => {
    expect(view.restricted[0]!.reason).toContain("Proclamation 10998")
    expect(view.restricted[0]!.reason_url).toContain("whitehouse.gov")
  })
  it("warns about the next rule change for a country", () => {
    expect(ruleChange("UK", catalogue, NOW)?.date).toBe("2026-11-30")
    expect(ruleChange("UK", catalogue, new Date("2027-02-01"))).toBeNull()
  })
})

describe("wizard draft", () => {
  const draft: Draft = {
    ...emptyDraft,
    degree_class: "upper_second",
    cgpa: "3.8",
    field: "computer_data_science",
    budget_millions: "80",
    tests: { ...emptyDraft.tests, ielts: { state: "taken", score: "7" }, gre: { state: "planned", score: "" } },
  }

  it("turns answers into a valid profile", () => {
    const result = toMatchProfile(draft, NOW)
    expect(result).toMatchObject({
      nationality: "NG",
      cgpa: 3.8,
      cgpa_scale: 5,
      ielts: 7,
      budget_total_minor: 8_000_000_000,
      target_cycle: "2027/28",
    })
  })
  it("sends planned tests to tests_planned, not to scores", () => {
    expect(toMatchProfile(draft, NOW)).toMatchObject({ tests_planned: ["gre"], gre: null })
  })
  it("keeps the TOEFL scale with the score", () => {
    const toefl = {
      ...draft,
      toefl_scale: "1-6" as const,
      tests: { ...draft.tests, toefl: { state: "taken" as const, score: "4.5" } },
    }
    expect(toMatchProfile(toefl, NOW)).toMatchObject({ toefl: 4.5, toefl_scale: "1-6" })
  })
  it("uses a default budget for I don't know yet, and counts it as incomplete", () => {
    const unknown = { ...draft, budget_unknown: true, budget_millions: "" }
    expect(toMatchProfile(unknown, NOW).budget_total_minor).toBe(6_000_000_000)
    expect(completeness(unknown)).toBeLessThan(completeness(draft))
  })
  it("survives an empty draft", () => {
    expect(() => toMatchProfile(emptyDraft, NOW)).not.toThrow()
  })
  it("labels match confidence from completeness", () => {
    expect([matchConfidence(90), matchConfidence(60), matchConfidence(20), matchConfidence(null)]).toEqual([
      "High",
      "Medium",
      "Low",
      null,
    ])
  })
  it("reads a saved profile back from the cookie, and ignores junk", () => {
    const cookie = encodeURIComponent(JSON.stringify(profile))
    expect(parseProfileCookie(cookie)).toEqual(profile)
    expect(parseProfileCookie("%7Bnot json")).toBeNull()
    expect(parseProfileCookie(undefined)).toBeNull()
  })
})

describe("cycle shown to a new student", () => {
  it("is next year's from September on", () => {
    expect(nextCycle(new Date("2026-11-05"))).toBe("2027/28")
    expect(nextCycle(new Date("2027-08-31"))).toBe("2027/28")
    expect(nextCycle(new Date("2027-09-01"))).toBe("2028/29")
  })
})
