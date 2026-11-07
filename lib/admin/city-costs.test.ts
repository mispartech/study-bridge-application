// @vitest-environment node
import { describe, expect, it } from "vitest"

import { toCityCostRows } from "./city-costs"
import { PublishError } from "./publish"

const record = () => ({
  currency: "GBP",
  country: "UK",
  city: "London",
  university: { official_domain: "kcl.ac.uk" },
  accommodation: [
    { accommodation_type: "university_halls", label: "Ensuite", price_low: 300, price_high: 390, period: "per_week" },
    { accommodation_type: "university_halls", label: "KAAS room", price_low: 163, price_high: 169, period: "per_week" },
    { accommodation_type: "private_studio", label: "Studio", price_low: 1600, price_high: 1800, period: "per_month" },
  ],
  living: { amount: 600, period: "per_month" },
  source_urls: ["https://www.kcl.ac.uk/accommodation/residences"],
})

describe("toCityCostRows", () => {
  it("turns weekly prices into monthly ones over the whole year, in minor units", () => {
    const { rows } = toCityCostRows(record())
    const halls = rows.find((r) => r.accommodation_type === "university_halls")!
    // £163 a week × 52 / 12 = £706.33; £390 × 52 / 12 = £1,690
    expect(halls).toMatchObject({ rent_monthly_low_minor: 70_633, rent_monthly_high_minor: 169_000 })
    expect(rows.find((r) => r.accommodation_type === "private_studio")).toMatchObject({
      rent_monthly_low_minor: 160_000,
      living_monthly_minor: 60_000,
    })
  })

  it("marks every row as the university's own figure, with its source", () => {
    for (const row of toCityCostRows(record()).rows) {
      expect(row).toMatchObject({ confidence: "university_page", is_demo: false })
      expect(row.source_url).toMatch(/^https:/)
    }
  })

  it("asks the reviewer to convert yearly or termly prices rather than guessing their length", () => {
    const yearly = record()
    yearly.accommodation[0]!.period = "per_academic_year"
    expect(() => toCityCostRows(yearly)).toThrow(/change it to a weekly or monthly figure/)
  })

  it("needs living costs excluding rent before it publishes", () => {
    const bad = { ...record(), living: null }
    expect(() => toCityCostRows(bad)).toThrow(PublishError)
  })
})
