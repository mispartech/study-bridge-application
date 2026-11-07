// @vitest-environment node
import { describe, expect, it } from "vitest"

import { fxBuffer, fxClose } from "./fx-display"

const totals = (market: number, official: number) => ({
  total_ngn_market: String(market),
  total_ngn_official: String(official),
})

describe("FX display", () => {
  it("shows one figure plus a 3% buffer when the rates are within 3%", () => {
    expect(fxClose(totals(102, 100))).toBe(true)
    expect(fxBuffer(totals(10_000, 9_900))).toBe(300n)
  })
  it("shows both figures once the gap reaches 3%", () => {
    expect(fxClose(totals(103, 100))).toBe(false)
    expect(fxClose(totals(140, 100))).toBe(false)
  })
})
