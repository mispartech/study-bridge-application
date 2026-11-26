import { describe, expect, it } from "vitest"

import demo from "@/tests/fixtures/demo-catalogue.json"

import { toPathways } from "./catalogue"
import { goalFit, type Pathway } from "./pathways"
import { presentResult } from "./present"
import { bundles, rank } from "./rank"
import { careerFit } from "./score"
import { matchProfile, type Catalogue } from "./types"

// Pathways are admin-managed data; these are test fixtures, not defaults the scorer knows about.
const corporate: Pathway = {
  key: "corporate",
  label: "Build a corporate career",
  description: "",
  active: true,
  sort_order: 20,
  signals: { field_match: 40, placement: 30, post_study_work: 30 },
}
const studyOnly: Pathway = {
  key: "study_only",
  label: "Get the degree",
  description: "",
  active: true,
  sort_order: 10,
  signals: { field_match: 80, funding: 20 },
}
const research: Pathway = {
  key: "academic",
  label: "Academic career",
  description: "",
  active: true,
  sort_order: 40,
  signals: { research: 100 },
}

describe("goal fit", () => {
  it("is the weighted average of the goal's signals", () => {
    const fit = goalFit({ field_match: 1, placement: 0, post_study_work: 0.5 }, [corporate], ["corporate"])
    expect(fit?.score).toBeCloseTo((40 * 1 + 30 * 0 + 30 * 0.5) / 100)
  })

  it("leaves out signals with no data, rather than counting them as zero", () => {
    const fit = goalFit({ field_match: 1, placement: 1, post_study_work: null }, [corporate], ["corporate"])
    expect(fit?.score).toBeCloseTo(1)
  })

  it("averages several goals", () => {
    const values = { field_match: 1, placement: 0, post_study_work: 0, funding: 1 }
    const fit = goalFit(values, [corporate, studyOnly], ["corporate", "study_only"])
    expect(fit?.score).toBeCloseTo((0.4 + 1) / 2)
  })

  it("ignores goals that are unknown or switched off, and signals weighted zero", () => {
    expect(goalFit({ field_match: 1 }, [corporate], ["no_such_goal"])).toBeNull()
    expect(goalFit({ field_match: 1 }, [{ ...corporate, active: false }], ["corporate"])).toBeNull()
    const zeroed = { ...corporate, signals: { field_match: 50, placement: 0 } }
    expect(goalFit({ field_match: 1, placement: 0 }, [zeroed], ["corporate"])?.score).toBe(1)
  })

  it("gives up when none of a goal's signals has data yet, so the default career fit applies", () => {
    expect(goalFit({ field_match: 1, research: null }, [research], ["academic"])).toBeNull()
  })

  it("names the signals that raised the score, but not the course match itself", () => {
    const fit = goalFit({ field_match: 1, placement: 1, post_study_work: 0.1 }, [corporate], ["corporate"])
    expect(fit?.reasons).toEqual(["placement"])
  })
})

describe("goals in matching, for UK and Canadian routes alike", () => {
  const options = { now: new Date("2026-11-05T12:00:00Z"), demoMode: true }
  const cat = { ...(demo as unknown as Catalogue), pathways: [corporate, studyOnly] }
  const base = matchProfile.parse({
    nationality: "NG",
    field: "computer_data_science",
    target_cycle: "2027/28",
    preferred_countries: ["UK", "CA"],
  })
  const bundleIn = (country: string) =>
    bundles(cat, true).find(
      (b) => b.university.country === country && b.programme.field === base.field && !b.programme.has_coop_or_placement
    )!
  const fit = (country: string, goals: string[]) => {
    const bundle = bundleIn(country)
    return careerFit(bundle, bundle.intakes[0]!, { ...base, goals }, cat, options)
  }

  it("keeps today's career fit for students with no goal", () => {
    // The same values as the default weights: Canada's 36-month permit is the longest, the UK's 18 is half.
    expect(fit("UK", [])).toBeCloseTo(0.7)
    expect(fit("CA", [])).toBeCloseTo(0.8)
  })

  it("follows the pathway's weights once a goal is chosen, using each country's own visa rules", () => {
    // Corporate: field 40 × 1, placement 30 × 0, work 30 × (months ÷ longest).
    expect(fit("CA", ["corporate"])).toBeCloseTo(0.7)
    expect(fit("UK", ["corporate"])).toBeCloseTo(0.4 + 0.3 * 0.5)
  })

  it("falls back to the default when the chosen goal isn't one the admin has set up", () => {
    expect(fit("UK", ["no_such_goal"])).toBeCloseTo(fit("UK", []))
  })

  it("changes when an admin changes a weight, with no code change", () => {
    const heavierWork = { ...corporate, signals: { field_match: 20, placement: 20, post_study_work: 60 } }
    const changed = { ...cat, pathways: [heavierWork] }
    const bundle = bundleIn("UK")
    const after = careerFit(bundle, bundle.intakes[0]!, { ...base, goals: ["corporate"] }, changed, options)
    expect(after).toBeCloseTo(0.2 + 0.6 * 0.5)
  })

  it("explains on the results card what the goal ranked up", () => {
    const profile = matchProfile.parse({
      nationality: "NG",
      degree_class: "upper_second",
      cgpa: 3.8,
      cgpa_scale: 5,
      field: "computer_data_science",
      ielts: 7,
      budget_total_minor: 100_000_000_000,
      target_cycle: "2027/28",
      target_term: "fall",
      goals: ["corporate"],
    })
    const view = presentResult(rank(profile, cat, options), profile, cat, options.now)
    const withCoop = view.ranked.find((c) => c.has_coop)
    expect(withCoop?.goal_reasons).toContain("Work placement or co-op")
    const none = presentResult(rank({ ...profile, goals: [] }, cat, options), profile, cat, options.now)
    expect(none.ranked.every((c) => c.goal_reasons.length === 0)).toBe(true)
  })
})

describe("pathways from the database", () => {
  it("attaches each pathway's weights and drops rows that don't validate", () => {
    const rows = [
      { key: "corporate", label: "Corporate", description: "", active: true, sort_order: 1 },
      { key: "Bad Key", label: "Broken", description: "", active: true, sort_order: 2 },
    ]
    const signals = [
      { pathway_key: "corporate", signal: "placement", weight: 30 },
      { pathway_key: "corporate", signal: "field_match", weight: 70 },
    ]
    expect(toPathways(rows, signals)).toEqual([{ ...rows[0], signals: { placement: 30, field_match: 70 } }])
  })
})
