// @vitest-environment node
import { describe, expect, it } from "vitest"

import { toHealthCoverRow } from "./health-cover"

const plan = () => ({
  plan_name: "International Health Insurance",
  university: { official_domain: "mcgill.ca" },
  country: "CA",
  amount: 1200.5,
  currency: "CAD",
  period: "per_year",
  compulsory: true,
  source_urls: ["https://www.mcgill.ca/internationalstudents/health"],
})

describe("toHealthCoverRow", () => {
  it("stores a compulsory yearly plan per year of study, as the university's own figure", () => {
    expect(toHealthCoverRow(plan()).row).toMatchObject({
      item: "health_cover",
      amount_minor: 120_050,
      per_year: true,
      confidence: "university_page",
    })
  })
  it("asks the reviewer to convert a termly price", () => {
    expect(() => toHealthCoverRow({ ...plan(), period: "per_term" })).toThrow(/yearly amount/)
  })
  it("won't let an optional plan override the province", () => {
    expect(() => toHealthCoverRow({ ...plan(), compulsory: false })).toThrow(/compulsory/)
  })
})
