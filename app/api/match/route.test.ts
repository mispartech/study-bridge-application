// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

import demo from "@/tests/fixtures/demo-catalogue.json"

import { POST } from "./route"

vi.mock("@/lib/match/catalogue", () => ({
  demoModeEnabled: () => true,
  loadCatalogue: async () => demo,
}))

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/match", { method: "POST", body: JSON.stringify(body) }))

const profile = {
  nationality: "NG",
  degree_class: "upper_second",
  cgpa: 3.8,
  cgpa_scale: 5,
  field: "computer_data_science",
  ielts: 7,
  budget_total_minor: 80_000_000_00,
  target_cycle: "2027/28",
  target_term: "fall",
  accommodation_pref: "university_halls",
}

describe("POST /api/match", () => {
  it("rejects an invalid profile with a 400", async () => {
    expect((await post({ nationality: "Nigeria" })).status).toBe(400)
  })
  it("rejects a TOEFL score with no scale", async () => {
    expect((await post({ ...profile, toefl: 100 })).status).toBe(400)
  })
  it("rejects a body that isn't JSON", async () => {
    const res = await POST(new Request("http://localhost/api/match", { method: "POST", body: "nope" }))
    expect(res.status).toBe(400)
  })
  it("returns near misses with the gap as a string", async () => {
    const res = await post({ ...profile, budget_total_minor: 40_000_000_00 })
    const body = (await res.json()) as { ranked: unknown[]; near_misses: { gap_ngn_minor: unknown }[] }
    expect(body.ranked).toEqual([])
    expect(body.near_misses.length).toBeGreaterThan(0)
    expect(typeof body.near_misses[0]!.gap_ngn_minor).toBe("string")
  })
  it("flags estimated cost lines for the UI", async () => {
    const res = await post(profile)
    const body = (await res.json()) as { ranked: { cost: { lines: { key: string; estimated: boolean }[] } }[] }
    const flights = body.ranked[0]!.cost.lines.find((l) => l.key === "flights")
    expect(flights?.estimated).toBe(true)
  })
  it("returns ranked, restricted and excluded lists, with money as strings", async () => {
    const res = await post(profile)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ranked: { cost: { total_minor: unknown } }[]
      restricted: unknown[]
      excluded: unknown[]
    }
    expect(body.restricted).toHaveLength(2)
    expect(body.ranked.length).toBeGreaterThan(0)
    expect(typeof body.ranked[0]!.cost.total_minor).toBe("string")
  })
})
