import { describe, expect, it } from "vitest"

import { describeAge, FRESH_DAYS, getFreshness } from "./freshness"

const now = new Date("2026-11-02T12:00:00Z")
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000)

describe("getFreshness", () => {
  it("is fresh below 90 days and aging from day 90", () => {
    expect(FRESH_DAYS).toBe(90)
    expect(getFreshness(daysAgo(0), now)).toEqual({ status: "fresh", days: 0 })
    expect(getFreshness(daysAgo(89), now)).toEqual({ status: "fresh", days: 89 })
    expect(getFreshness(daysAgo(90), now)).toEqual({ status: "aging", days: 90 })
    expect(getFreshness(daysAgo(400), now).status).toBe("aging")
  })

  it("counts whole days only", () => {
    expect(getFreshness(new Date(now.getTime() - 89.99 * 86_400_000), now).days).toBe(89)
  })

  it("accepts ISO strings, as returned by Postgres", () => {
    expect(getFreshness("2026-10-21T12:00:00Z", now)).toEqual({ status: "fresh", days: 12 })
  })

  it("treats future dates as verified today", () => {
    expect(getFreshness(daysAgo(-3), now).days).toBe(0)
  })

  it("rejects invalid dates", () => {
    expect(() => getFreshness("not a date", now)).toThrow(RangeError)
  })
})

describe("describeAge", () => {
  it.each([
    [0, "today"],
    [1, "yesterday"],
    [12, "12 days ago"],
    [59, "59 days ago"],
    [95, "3 months ago"],
    [800, "2 years ago"],
  ])("%i days → %s", (days, text) => {
    expect(describeAge(days)).toBe(text)
  })
})
