// @vitest-environment node
import { describe, expect, it } from "vitest"

import { nairaPerUnit } from "./reference-rates"

describe("nairaPerUnit", () => {
  it("turns a naira-based quote into naira per pound, Canadian dollar and US dollar", () => {
    const rates = nairaPerUnit({ NGN: 1, GBP: 0.0005, CAD: 0.001, USD: 0.000625 })
    expect(rates).toEqual([
      { currency: "GBP", rate: 2000 },
      { currency: "CAD", rate: 1000 },
      { currency: "USD", rate: 1600 },
    ])
  })

  it("refuses a response missing a currency rather than storing a gap", () => {
    expect(() => nairaPerUnit({ GBP: 0.0005, CAD: 0.001 })).toThrow(/USD/)
  })
})
