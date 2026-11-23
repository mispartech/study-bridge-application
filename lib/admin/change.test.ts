import { describe, expect, it } from "vitest"

import { change, formatChange } from "./change"

describe("change against the previous period", () => {
  it("gives the percentage and whether it's good news", () => {
    expect(change(150, 100)).toEqual({ ratio: 0.5, direction: "up", good: true })
    expect(change(50, 100)).toEqual({ ratio: -0.5, direction: "down", good: false })
  })

  it("treats fewer errors as good news", () => {
    expect(change(2, 4, "down")).toMatchObject({ direction: "down", good: true })
    expect(change(8, 4, "down")).toMatchObject({ direction: "up", good: false })
  })

  it("has no percentage from zero, but still says it went up", () => {
    expect(change(5, 0)).toEqual({ ratio: null, direction: "up", good: true })
    expect(formatChange(change(5, 0))).toBe("Up from zero")
  })

  it("says no change when equal, including zero to zero", () => {
    expect(change(0, 0)).toEqual({ ratio: null, direction: "flat", good: null })
    expect(formatChange(change(7, 7))).toBe("No change")
  })

  it("has nothing to compare with when a value is missing", () => {
    expect(change(null, 10)).toEqual({ ratio: null, direction: "flat", good: null })
    expect(change(10, null).direction).toBe("flat")
  })

  it("formats rounded percentages with a sign", () => {
    expect(formatChange(change(133, 100))).toBe("+33%")
    expect(formatChange(change(1, 3))).toBe("−67%")
  })
})
