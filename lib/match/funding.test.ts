import { describe, expect, it } from "vitest"

import demo from "@/tests/fixtures/demo-catalogue.json"
import { fundingInput, linkProblem, toFundingRow } from "@/lib/admin/funding"

import { normaliseAcademics } from "./academics"
import { presentResult } from "./present"
import { bundles, fundingStatus, rank } from "./rank"
import { eligibleScholarships, fitScore } from "./score"
import { matchProfile, type Catalogue } from "./types"

const options = { now: new Date("2026-11-05T12:00:00Z"), demoMode: true }
const profile = matchProfile.parse({
  nationality: "NG",
  degree_class: "upper_second",
  cgpa: 3.8,
  cgpa_scale: 5,
  field: "computer_data_science",
  ielts: 7,
  budget_total_minor: 100_000_000_000,
  target_cycle: "2027/28",
  target_term: "fall",
  preferred_countries: ["CA"],
})

/** The demo catalogue with one Canadian funding record to vary. */
function setup(over: Record<string, unknown> = {}) {
  const cat = structuredClone(demo) as unknown as Catalogue
  const bundle = bundles(cat, true).find((b) => b.university.country === "CA" && b.programme.field === profile.field)!
  const base = cat.scholarships[0]!
  cat.scholarships = [
    {
      ...base,
      id: "00000000-0000-4000-8000-00000000f00d",
      name: "Entrance Award",
      countries: ["CA"],
      fields: [],
      eligible_nationalities: [],
      min_uk_class: null,
      amount_minor: 200_000,
      currency: "CAD",
      coverage: "partial",
      deadline: "2027-03-01",
      open_to_international: "yes",
      eligible_from: "admission",
      levels: [],
      regions: [],
      university_id: null,
      percent_of_tuition: null,
      ...over,
    } as Catalogue["scholarships"][number],
  ]
  const academics = normaliseAcademics(profile, cat.gradeMappings)
  const eligible = () => eligibleScholarships(bundle, profile, academics, cat, options)
  return { cat, bundle, eligible }
}

describe("funding a student can count on", () => {
  it("counts funding open to international students, on admission", () => {
    expect(setup().eligible()).toHaveLength(1)
  })

  it("never shows funding closed to international students, or that doesn't say", () => {
    expect(setup({ open_to_international: "no" }).eligible()).toHaveLength(0)
    expect(setup({ open_to_international: null }).eligible()).toHaveLength(0)
  })

  it("counts limited funding, labelled as limited", () => {
    const { eligible } = setup({ open_to_international: "limited" })
    expect(eligible()).toHaveLength(1)
    expect(fundingStatus(eligible())).toBe("limited")
    expect(fundingStatus(setup().eligible())).toBe("yes")
    expect(fundingStatus([])).toBeNull()
  })

  it("doesn't count funding only available after classes start", () => {
    expect(setup({ eligible_from: "after_start" }).eligible()).toHaveLength(0)
  })

  it("respects the institution, region and level it is limited to", () => {
    const { bundle } = setup()
    expect(setup({ university_id: bundle.university.id }).eligible()).toHaveLength(1)
    expect(setup({ university_id: "00000000-0000-4000-8000-000000000000" }).eligible()).toHaveLength(0)
    expect(setup({ regions: [bundle.university.region] }).eligible()).toHaveLength(1)
    expect(setup({ regions: ["Nowhere"] }).eligible()).toHaveLength(0)
    expect(setup({ levels: ["masters"] }).eligible()).toHaveLength(1)
    expect(setup({ levels: ["postgraduate_certificate"] }).eligible()).toHaveLength(0)
  })

  it("values a share of tuition against the programme's own fee", () => {
    const half = setup({ amount_minor: null, currency: null, percent_of_tuition: 50 })
    const academics = normaliseAcademics(profile, half.cat.gradeMappings)
    const intake = half.bundle.intakes[0]!
    const outcome = {
      cost: { total_ngn: { market: 0n, official: 0n } } as never,
      intake,
      headroom: 2,
      reach: false,
    }
    // Half of tuition is exactly what the scholarship component measures against, so it scores 1.
    expect(fitScore(half.bundle, outcome, profile, academics, half.cat, options).S).toBe(1)
  })

  it("shows a Funded chip on results only when there is funding the student can get", () => {
    const funded = setup()
    const view = presentResult(rank(profile, funded.cat, options), profile, funded.cat, options.now)
    const card = [...view.ranked, ...view.more].find((c) => c.id === funded.bundle.programme.id)
    expect(card?.funding).toBe("yes")
    const closed = setup({ open_to_international: "no" })
    const none = presentResult(rank(profile, closed.cat, options), profile, closed.cat, options.now)
    expect([...none.ranked, ...none.more].every((c) => c.funding === null)).toBe(true)
  })
})

describe("entering funding in the admin", () => {
  const valid = {
    name: "International Entrance Scholarship",
    funder: "Example College",
    funding_type: "entrance_award",
    countries: ["CA"],
    open_to_international: "yes",
    eligible_from: "admission",
    coverage: "partial",
    amount: 2000,
    currency: "CAD",
    url: "https://www.example-college.ca/awards",
    source_url: "https://www.example-college.ca/awards",
    confidence: "official",
  }

  it("needs international eligibility stated, and https links", () => {
    expect(fundingInput.safeParse(valid).success).toBe(true)
    expect(fundingInput.safeParse({ ...valid, open_to_international: undefined }).success).toBe(false)
    expect(fundingInput.safeParse({ ...valid, url: "http://www.example-college.ca/awards" }).success).toBe(false)
  })

  it("needs an amount with its currency, or a share of tuition, not both", () => {
    expect(fundingInput.safeParse({ ...valid, currency: null }).success).toBe(false)
    expect(fundingInput.safeParse({ ...valid, percent_of_tuition: 25 }).success).toBe(false)
    expect(fundingInput.safeParse({ ...valid, amount: null, currency: null, percent_of_tuition: 25 }).success).toBe(
      true
    )
  })

  it("stores money in minor units and marks the record verified now", () => {
    const now = new Date("2026-11-24T10:00:00Z")
    const row = toFundingRow(fundingInput.parse(valid), now)
    expect(row).toMatchObject({ amount_minor: 200_000, last_verified_at: now.toISOString(), is_demo: false })
    expect("amount" in row).toBe(false)
  })

  it("keeps an institution's own funding links on its official site", () => {
    const own = fundingInput.parse({ ...valid, university_id: "00000000-0000-4000-8000-000000000001" })
    expect(linkProblem(own, ["example-college.ca"])).toBeNull()
    expect(linkProblem({ ...own, url: "https://scholarships-agent.com/x" }, ["example-college.ca"])).toMatch(/official/)
    expect(linkProblem(fundingInput.parse(valid), null)).toBeNull()
  })
})
