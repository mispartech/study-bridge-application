import { describe, expect, it } from "vitest"

import { averageConfidence, confidenceLabel, dataConfidence, searchConfidence } from "./data-confidence"

const now = new Date("2026-11-14T12:00:00Z")
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()

describe("data confidence", () => {
  it("is high for a recently checked university page with official costs", () => {
    const score = dataConfidence({
      source: "university_page",
      lastVerifiedAt: daysAgo(10),
      costLines: [{ estimated: false }, { estimated: false }],
      now,
    })
    expect(score).toBe(95)
    expect(confidenceLabel(score)).toBe("High")
  })

  it("drops as facts age and as more costs are estimates", () => {
    const fresh = dataConfidence({ source: "official", lastVerifiedAt: daysAgo(30), costLines: [], now })
    const old = dataConfidence({ source: "official", lastVerifiedAt: daysAgo(400), costLines: [], now })
    const estimated = dataConfidence({
      source: "official",
      lastVerifiedAt: daysAgo(30),
      costLines: [{ estimated: true }, { estimated: false }],
      now,
    })
    expect(fresh).toBe(100)
    expect(old).toBe(60)
    expect(estimated).toBe(90)
  })

  it("treats an unknown source as an estimate", () => {
    expect(dataConfidence({ source: "???", lastVerifiedAt: daysAgo(1), costLines: [], now })).toBe(45)
    expect(confidenceLabel(45)).toBe("Low")
  })

  it("combines profile completeness with result reliability", () => {
    expect(searchConfidence(80, 90)).toBe(85)
    expect(searchConfidence(null, 90)).toBe(90)
    expect(searchConfidence(70, null)).toBe(70)
    expect(averageConfidence([100, 80, 60])).toBe(80)
    expect(averageConfidence([])).toBeNull()
  })
})
