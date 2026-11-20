import { describe, expect, it } from "vitest"

import demo from "@/tests/fixtures/demo-catalogue.json"

import { matchProfile, rank } from "."
import { presentResult } from "./present"
import type { Catalogue } from "./types"

const NOW = new Date("2026-11-05T12:00:00Z")
const profile = matchProfile.parse({
  nationality: "NG",
  degree_class: "upper_second",
  cgpa: 3.8,
  cgpa_scale: 5,
  field: "computer_data_science",
  ielts: 7,
  budget_total_minor: 80_000_000_00,
  target_cycle: "2027/28",
  accommodation_pref: "university_halls",
})

describe("no market rate entered yet", () => {
  it("still returns results, priced at the mid-market rate, and says so", () => {
    const full = demo as unknown as Catalogue
    const officialOnly = { ...full, fxRates: full.fxRates.filter((r) => r.rate_kind === "official") }
    const withMarket = presentResult(rank(profile, full, { now: NOW, demoMode: true }), profile, full, NOW)
    const fallback = presentResult(
      rank(profile, officialOnly, { now: NOW, demoMode: true }),
      profile,
      officialOnly,
      NOW
    )
    expect(fallback.ranked.length + fallback.more.length).toBe(withMarket.ranked.length + withMarket.more.length)
    expect(fallback.fx_fallback.sort()).toEqual(Object.keys(fallback.fx.official).sort())
    expect(withMarket.fx_fallback).toEqual([])
  })
})

describe("suggestions when nothing fits", () => {
  it("offers a budget that opens up programmes, and checks the count by re-running the match", async () => {
    const { suggest } = await import("./suggest")
    const catalogue = demo as unknown as Catalogue
    const tight = matchProfile.parse({ ...profile, budget_total_minor: 20_000_000_00, preferred_countries: ["UK"] })
    const out = suggest(tight, catalogue, { now: NOW, demoMode: true })
    const budget = out.find((s) => s.kind === "budget")
    expect(budget).toBeDefined()
    expect(BigInt((budget as { budget_minor: string }).budget_minor) % 100_000_000n).toBe(0n)
    expect(budget!.count).toBeGreaterThan(0)
    const raised = matchProfile.parse({
      ...tight,
      budget_total_minor: Number((budget as { budget_minor: string }).budget_minor),
    })
    const r = rank(raised, catalogue, { now: NOW, demoMode: true })
    expect([...r.ranked, ...r.more].filter((x) => x.bundle.university.country === "UK").length).toBe(budget!.count)
  })
})
