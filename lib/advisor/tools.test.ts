// @vitest-environment node
import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { matchProfile, type Catalogue } from "@/lib/match"
import demo from "@/tests/fixtures/demo-catalogue.json"

import {
  comparison,
  costBreakdown,
  programmeDetail,
  programmeSearch,
  scholarshipSearch,
  visaRules,
  type AdvisorContext,
} from "./tools"

const NOW = new Date("2026-11-05T12:00:00Z")
const NO_ID = "00000000-0000-0000-0000-000000000000"
const profile = matchProfile.parse({
  nationality: "NG",
  degree_class: "upper_second",
  cgpa: 3.8,
  cgpa_scale: 5,
  field: "computer_data_science",
  ielts: 7,
  budget_total_minor: 8_000_000_000,
  target_cycle: "2027/28",
  target_term: "fall",
  accommodation_pref: "university_halls",
})
const ctx: AdvisorContext = {
  profile,
  catalogue: demo as unknown as Catalogue,
  options: { now: NOW, demoMode: true },
  addToShortlist: async () => "added",
}
const id = (title: string, university: string) =>
  programmeSearch({ title_contains: title, university_contains: university }, ctx).programmes[0]!.id

describe("advisor tools", () => {
  it("every search result carries its source and verification date", () => {
    const { programmes, sources } = programmeSearch({}, ctx)
    expect(programmes.length).toBeGreaterThan(0)
    for (const card of programmes) {
      expect(card.source_url).toBeTruthy()
      expect(card.last_verified_at).toBeTruthy()
    }
    expect(sources).toHaveLength(programmes.length)
  })

  it("never shows a Nigerian student a US programme as an option, and says why", () => {
    const { programmes, restricted_for_this_student } = programmeSearch({ country: "US" }, ctx)
    expect(programmes).toEqual([])
    expect(restricted_for_this_student.length).toBeGreaterThan(0)
    expect(restricted_for_this_student[0]!.source_url).toBeTruthy()
    const named = programmeSearch({ title_contains: "Data Science", university_contains: "Bayview" }, ctx)
    expect(named.programmes).toEqual([])
    expect(named.restricted_for_this_student).toHaveLength(1)
  })

  it("finds a named programme outside the student's field and budget", () => {
    const poor = { ...ctx, profile: { ...profile, budget_total_minor: 100_000_000 } }
    expect(programmeSearch({ title_contains: "Global Public Health" }, poor).programmes).toHaveLength(1)
  })

  it("returns nothing for a programme we don't hold", () => {
    expect(programmeSearch({ title_contains: "Quantum Computing" }, ctx).programmes).toEqual([])
    expect(programmeDetail(NO_ID, ctx).found).toBe(false)
    expect(costBreakdown(NO_ID, undefined, ctx).found).toBe(false)
  })

  it("details, costs and comparisons pass sources through", () => {
    const first = id("Data Analytics", "Northmoor")
    const second = id("Data Science", "Thamesbank")
    const results = [
      programmeDetail(first, ctx),
      costBreakdown(first, undefined, ctx),
      comparison([first, second], ctx),
    ]
    for (const result of results) {
      expect(result.sources.length).toBeGreaterThan(0)
      for (const source of result.sources) {
        expect(source.source_url).toBeTruthy()
        expect(source.last_verified_at).toBeTruthy()
      }
    }
  })

  it("cost breakdown states the visa proof of funds and respects accommodation", () => {
    const programme = id("Data Analytics", "Northmoor")
    const halls = costBreakdown(programme, undefined, ctx)
    const flat = costBreakdown(programme, "shared_flat", ctx)
    const studio = costBreakdown(programme, "private_studio", ctx)
    expect(halls).toHaveProperty("visa_proof_of_funds")
    if (!("lines" in halls) || !("lines" in flat) || !("lines" in studio)) throw new Error("expected costs")
    expect(flat.accommodation).toBe("shared_flat")
    expect(flat.total_first_year).not.toBe(halls.total_first_year)
    // Manchester has no studio figure on file: the tool says so rather than inventing one.
    expect(studio.asked_for_accommodation_available).toBe(false)
  })

  it("visa rules flag the restriction for Nigerians and not elsewhere, with sources", () => {
    const nigeria = visaRules("US", undefined, ctx)
    expect(nigeria.restricted?.source_url).toBeTruthy()
    expect(nigeria.sources[0]!.label).toBe("Visa restriction")
    expect(visaRules("UK", undefined, ctx).restricted).toBeNull()
    expect(visaRules("UK", undefined, ctx).rules.length).toBeGreaterThan(0)
  })

  it("gives naira alongside local money, so nothing needs converting", () => {
    const fees = visaRules("UK", undefined, ctx).rules.find((r) => r.type === "government_fee")!
    expect(fees.amounts.map((a) => a.item)).toEqual(expect.arrayContaining(["visa fee", "ihs per year", "total"]))
    for (const amount of fees.amounts) expect(amount.ngn).toMatch(/^₦/)
    const cost = costBreakdown(id("Data Analytics", "Northmoor"), undefined, ctx)
    if (!("lines" in cost)) throw new Error("expected costs")
    for (const line of cost.lines) expect(line.ngn).toMatch(/^₦/)
    expect(cost.visa_proof_of_funds_ngn).toMatch(/^₦/)
  })

  it("does the budget sums, so the model has none to do", () => {
    const within = programmeSearch({}, ctx).programmes[0]!
    expect(within.student_budget).toBe("₦80m")
    expect(within.budget_left_after).toMatch(/^₦/)
    const poor = { ...ctx, profile: { ...profile, budget_total_minor: 100_000_000 } }
    const [over] = programmeSearch({ title_contains: "Data Analytics" }, poor).programmes
    expect(over!.over_budget_by).toMatch(/^₦/)
    expect(over!.budget_left_after).toBeNull()
  })

  it("scholarships carry their source", () => {
    const { scholarships, sources } = scholarshipSearch(undefined, ctx)
    expect(sources).toHaveLength(scholarships.length)
    for (const s of scholarships) expect(s.last_verified_at).toBeTruthy()
  })

  it("flags records older than 120 days", () => {
    const later = { ...ctx, options: { ...ctx.options, now: new Date("2027-06-01T00:00:00Z") } }
    const detail = programmeDetail(id("Data Analytics", "Northmoor"), later)
    expect("programme" in detail && detail.programme.stale).toBe(true)
  })
})

describe("R1", () => {
  it("is the text in docs/PROMPTS.md, word for word", () => {
    const doc = readFileSync("docs/PROMPTS.md", "utf8").replace(/\r\n/g, "\n")
    const prompt = readFileSync("prompts/r1_advisor.txt", "utf8").replace(/\r\n/g, "\n").trimEnd()
    expect(doc).toContain(prompt)
    expect(prompt).toContain("{{profile_json}}")
  })
})
