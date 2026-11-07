// @vitest-environment node
import { describe, expect, it } from "vitest"

import { changedFields, fieldChangeStats } from "./field-changes"

describe("changedFields", () => {
  it("lists the paths a reviewer changed, and nothing else", () => {
    const proposed = { programme: { title: "MSc A", duration_months: 12 }, fees: [{ amount: 1 }, { amount: 2 }] }
    const approved = { programme: { title: "MSc A", duration_months: 16 }, fees: [{ amount: 1 }, { amount: 3 }] }
    expect(changedFields(proposed, approved)).toEqual(["programme.duration_months", "fees[1].amount"])
  })

  it("treats a missing value and null as the same", () => {
    expect(changedFields({ a: null }, {})).toEqual([])
  })

  it("counts an added or removed list item", () => {
    expect(changedFields({ intakes: [{ term: "fall" }] }, { intakes: [] })).toEqual(["intakes[0]"])
  })
})

describe("fieldChangeStats", () => {
  it("counts each field once per record, across list positions", () => {
    const stats = fieldChangeStats([
      { field_changes: ["fees[0].amount", "fees[1].amount"] },
      { field_changes: ["fees[0].amount"] },
      { field_changes: [] },
      { field_changes: null },
    ])
    expect(stats).toEqual([{ field: "fees[].amount", changed: 2, rate: 0.5 }])
  })
})
