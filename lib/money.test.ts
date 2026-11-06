import { describe, expect, it } from "vitest"

import { formatMoney } from "./money"

// Intl output uses narrow no-break spaces in some locales; normalise for readable asserts.
const fmt = (...args: Parameters<typeof formatMoney>) => formatMoney(...args).replace(/[  ]/g, " ")

describe("formatMoney", () => {
  it("formats NGN from kobo with the naira sign", () => {
    expect(fmt(450_000_000n, "NGN")).toBe("₦4,500,000")
  })

  it("formats GBP, USD and CAD from minor units", () => {
    expect(fmt(1_850_000n, "GBP")).toBe("£18,500")
    expect(fmt(1_850_000n, "USD")).toBe("$18,500")
    // CAD shows its code so it can't be mistaken for USD.
    expect(fmt(1_850_000n, "CAD")).toBe("CAD 18,500")
  })

  it("shows the fraction only when non-zero by default", () => {
    expect(fmt(1_850_050n, "GBP")).toBe("£18,500.50")
    expect(fmt(1_850_005n, "GBP")).toBe("£18,500.05")
  })

  it("supports fraction=always and fraction=never", () => {
    expect(fmt(1_850_000n, "USD", { fraction: "always" })).toBe("$18,500.00")
    expect(fmt(1_850_050n, "USD", { fraction: "never" })).toBe("$18,501")
    expect(fmt(1_850_049n, "USD", { fraction: "never" })).toBe("$18,500")
  })

  it("rounds half away from zero for negatives", () => {
    expect(fmt(-1_850_050n, "USD", { fraction: "never" })).toBe("-$18,501")
    expect(fmt(-125_000n, "GBP")).toBe("-£1,250")
  })

  it("formats zero", () => {
    expect(fmt(0n, "NGN")).toBe("₦0")
  })

  it("keeps precision beyond Number.MAX_SAFE_INTEGER", () => {
    // 90,071,992,547,409.93 naira: would lose the last digits as a float.
    expect(fmt(9_007_199_254_740_993n, "NGN")).toBe("₦90,071,992,547,409.93")
  })

  it("accepts safe integer numbers and rejects fractional ones", () => {
    expect(fmt(12_345, "GBP")).toBe("£123.45")
    expect(() => formatMoney(12.5, "GBP")).toThrow(TypeError)
  })

  it("supports compact notation", () => {
    expect(fmt(450_000_000n, "NGN", { compact: true })).toBe("₦4.5M")
  })
})
