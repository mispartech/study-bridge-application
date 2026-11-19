// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db/service", () => ({ serviceClient: () => ({}) }))

import { APPROVAL_ORDER, isReady } from "./approve"

const programme = {
  university: {
    name: "University of Example",
    country: "CA",
    city: "Halifax",
    official_domain: "example.ca",
    region: "Nova Scotia",
    is_public: true,
    register_url: "https://www.canada.ca/dli",
  },
  programme: {
    title: "MSc Computing",
    degree_type: "MSc",
    field: "computer_data_science",
    duration_months: 12,
    programme_url: "https://www.example.ca/msc",
  },
  requirement: { min_gpa4: 3, english_tests: [] },
  intakes: [{ start_term: "fall", start_month: "2027-09", deadlines: [] }],
  fees: [{ fee_year: "2027/28", tuition_amount: 20000, currency: "CAD", basis: "per_year" }],
  source_urls: ["https://www.example.ca/msc"],
}

describe("approve all ready", () => {
  it("counts a programme that passes every check", () => {
    expect(isReady({ table_name: "programme", proposed: programme })).toBe(true)
  })

  it("leaves out a programme that still needs fixing", () => {
    expect(isReady({ table_name: "programme", proposed: { ...programme, fees: [] } })).toBe(false)
  })

  it("leaves out record types it doesn't know", () => {
    expect(isReady({ table_name: "something_else", proposed: programme })).toBe(false)
  })

  it("approves programmes before the costs and health plans that need their university", () => {
    const order = ["health_cover", "city_cost", "programme"].sort((a, b) => APPROVAL_ORDER[a]! - APPROVAL_ORDER[b]!)
    expect(order).toEqual(["programme", "city_cost", "health_cover"])
  })
})
