import { describe, expect, it } from "vitest"

import demo from "@/tests/fixtures/demo-catalogue.json"
import {
  fieldImport,
  institutionInput,
  isOfficialSource,
  occupationInput,
  parseFieldLines,
  validSuggestions,
} from "@/lib/admin/careers"

import { demandFor, demandSignal, workPermitSignal, type Careers } from "./careers"
import { presentResult } from "./present"
import { bundles, rank } from "./rank"
import { careerFit } from "./score"
import { matchProfile, type Bundle, type Catalogue } from "./types"

const now = new Date("2026-11-05T12:00:00Z")
const fresh = "2026-11-01T00:00:00Z"
const stale = "2026-06-01T00:00:00Z"
const source_url = "https://www.canada.ca/x"
const stamp = {
  source_url,
  last_verified_at: fresh,
  confidence: "official" as const,
  created_at: fresh,
  updated_at: fresh,
}
const OCC = "00000000-0000-4000-8000-0000000000aa"

function setup(country: "CA" | "UK" = "CA") {
  const cat = structuredClone(demo) as unknown as Catalogue
  const found = bundles(cat, true).find(
    (b) => b.university.country === country && b.programme.field === "computer_data_science"
  )!
  const bundle: Bundle = structuredClone(found)
  const careers: Careers = {
    occupations: [
      {
        id: OCC,
        country,
        system: country === "CA" ? "NOC2021" : "SOC2020",
        code: "21211",
        title: "Data scientists",
        ...stamp,
      },
    ],
    demand: [
      {
        id: "d1",
        occupation_id: OCC,
        region: bundle.university.region,
        source_type: "in_demand_list",
        label: "On the in-demand list",
        valid_from: "2026-01-01",
        valid_to: null,
        ...stamp,
      },
    ],
    fields: [
      {
        id: "f1",
        country,
        code: "11.0802",
        title: "Data modelling",
        category: "STEM",
        eligible_from: "2024-11-01",
        eligible_to: null,
        ...stamp,
      },
    ],
    links: [{ programme_id: bundle.programme.id, occupation_id: OCC }],
  }
  return { cat, bundle, careers }
}

const rule = (over: Record<string, unknown> = {}, verified = fresh) => ({
  value: {
    months: 36,
    non_degree: "programme_length",
    min_programme_months: 8,
    institution_check: "required",
    non_degree_field_of_study_required: true,
    ...over,
  },
  last_verified_at: verified,
})

describe("in demand, for any country", () => {
  it.each(["CA", "UK"] as const)("shows current demand in the programme's own region (%s)", (country) => {
    const { bundle, careers } = setup(country)
    expect(demandFor(bundle, careers, now)).toMatchObject([
      { title: "Data scientists", region: bundle.university.region },
    ])
    expect(demandSignal(bundle, careers, now)).toBe(1)
  })

  it("ignores another region, another country, and links nobody approved", () => {
    const a = setup()
    a.careers.demand[0]!.region = "Elsewhere"
    expect(demandFor(a.bundle, a.careers, now)).toEqual([])
    const b = setup()
    b.careers.occupations[0]!.country = "UK"
    expect(demandFor(b.bundle, b.careers, now)).toEqual([])
    const c = setup()
    c.careers.links = []
    expect(demandFor(c.bundle, c.careers, now)).toEqual([])
    expect(demandSignal(c.bundle, c.careers, now)).toBeNull()
  })

  it("ignores demand that is stale, over or not started, and treats it as unknown rather than zero", () => {
    for (const change of [{ last_verified_at: stale }, { valid_to: "2026-10-01" }, { valid_from: "2027-01-01" }]) {
      const { bundle, careers } = setup()
      Object.assign(careers.demand[0]!, change)
      expect(demandFor(bundle, careers, now)).toEqual([])
      expect(demandSignal(bundle, careers, now)).toBeNull()
    }
  })

  it("is zero when current data covers the place and the linked career isn't in it", () => {
    const { bundle, careers } = setup()
    careers.occupations.push({ ...careers.occupations[0]!, id: "other", code: "11100" })
    careers.demand[0]!.occupation_id = "other"
    expect(demandSignal(bundle, careers, now)).toBe(0)
  })
})

describe("leads to a work permit", () => {
  const eligible = (b: Bundle) => {
    b.university.pgwp_eligible = "yes"
    b.university.pgwp_checked_at = fresh
    b.programme.duration_months = 12
  }

  it("claims nothing without a current rule that says what to check", () => {
    const { bundle, careers } = setup()
    eligible(bundle)
    expect(workPermitSignal(bundle, undefined, careers, now)).toBeNull()
    expect(workPermitSignal(bundle, rule({}, stale), careers, now)).toBeNull()
    expect(workPermitSignal(bundle, rule({ institution_check: undefined }), careers, now)).toBeNull()
  })

  it("needs the institution checked, recently, as eligible", () => {
    const { bundle, careers } = setup()
    eligible(bundle)
    expect(workPermitSignal(bundle, rule(), careers, now)).toBe(1)
    bundle.university.pgwp_checked_at = stale
    expect(workPermitSignal(bundle, rule(), careers, now)).toBeNull()
    bundle.university.pgwp_checked_at = fresh
    bundle.university.pgwp_eligible = "unknown"
    expect(workPermitSignal(bundle, rule(), careers, now)).toBeNull()
    bundle.university.pgwp_eligible = "no"
    expect(workPermitSignal(bundle, rule(), careers, now)).toBe(0)
  })

  it("needs a current eligible field for college programmes only", () => {
    const { bundle, careers } = setup()
    eligible(bundle)
    bundle.programme.level = "postgraduate_certificate"
    bundle.programme.cip_code = null
    expect(workPermitSignal(bundle, rule(), careers, now)).toBeNull()
    bundle.programme.cip_code = "99.9999"
    expect(workPermitSignal(bundle, rule(), careers, now)).toBeNull()
    bundle.programme.cip_code = "11.0802"
    expect(workPermitSignal(bundle, rule(), careers, now)).toBe(1)
    careers.fields[0]!.eligible_to = "2026-01-01"
    expect(workPermitSignal(bundle, rule(), careers, now)).toBe(0)
    careers.fields[0]!.eligible_to = null
    careers.fields[0]!.last_verified_at = stale
    expect(workPermitSignal(bundle, rule(), careers, now)).toBeNull()
  })

  it("is zero below the minimum length, and works for countries with no institution check", () => {
    const { bundle, careers } = setup("UK")
    bundle.programme.duration_months = 12
    expect(workPermitSignal(bundle, rule({ institution_check: "not_required" }), careers, now)).toBe(1)
    bundle.programme.duration_months = 6
    expect(workPermitSignal(bundle, rule({ institution_check: "not_required" }), careers, now)).toBe(0)
  })
})

describe("careers in results", () => {
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
  })
  const options = { now, demoMode: true }

  it("puts sourced demand on the card, and nothing on programmes without it", () => {
    const { cat } = setup()
    const { ranked } = rank(profile, cat, options)
    const target = ranked[0]!.bundle
    const { careers } = setup(target.university.country as "CA" | "UK")
    careers.links = [{ programme_id: target.programme.id, occupation_id: OCC }]
    careers.demand[0]!.region = target.university.region
    cat.careers = careers
    const view = presentResult(rank(profile, cat, options), profile, cat, now)
    const cards = [...view.ranked, ...view.more]
    expect(cards.find((c) => c.id === target.programme.id)?.demand).toMatchObject([{ source_url }])
    expect(cards.filter((c) => c.id !== target.programme.id).every((c) => c.demand.length === 0)).toBe(true)
    expect(cards.every((c) => c.work_permit_source === null)).toBe(true)
  })

  it("counts only for students whose goal uses it", () => {
    const { cat, bundle, careers } = setup()
    cat.careers = careers
    cat.pathways = [
      {
        key: "corporate",
        label: "Corporate",
        description: "",
        active: true,
        sort_order: 1,
        signals: { in_demand: 100 },
      },
    ]
    const fit = (goals: string[]) => careerFit(bundle, bundle.intakes[0]!, { ...profile, goals }, cat, options)
    expect(fit(["corporate"])).toBe(1)
    const before = fit([])
    cat.careers = { ...careers, demand: [] }
    expect(fit([])).toBe(before)
  })
})

describe("what editors can enter", () => {
  const occupation = { country: "CA", code: "21211", title: "Data scientists", source_url }

  it("accepts official government sources only", () => {
    expect(isOfficialSource("https://noc.esdc.gc.ca/x")).toBe(true)
    expect(isOfficialSource("https://www.gov.uk/x")).toBe(true)
    expect(isOfficialSource("http://www.canada.ca/x")).toBe(false)
    expect(isOfficialSource("https://canada.ca.agent.com/x")).toBe(false)
    expect(isOfficialSource("https://notcanada.ca/x")).toBe(false)
  })

  it("checks the code for the country", () => {
    expect(occupationInput.safeParse(occupation).success).toBe(true)
    expect(occupationInput.safeParse({ ...occupation, code: "2121" }).success).toBe(false)
    expect(occupationInput.safeParse({ ...occupation, country: "UK", code: "2433" }).success).toBe(true)
  })

  it("reads pasted fields and reports every bad or repeated line", () => {
    expect(parseFieldLines("11.0701 | Computer science | STEM\n\n51.3801\tNursing\tHealth").rows).toHaveLength(2)
    const bad = parseFieldLines("11.0701 | Computer science | STEM\n11.0701 | Again | STEM\nnonsense")
    expect(bad.errors).toHaveLength(2)
    expect(
      fieldImport.safeParse({
        country: "CA",
        lines: "x",
        eligible_from: "2026-01-01",
        eligible_to: "2025-01-01",
        source_url,
      }).success
    ).toBe(false)
  })

  it("needs a source to mark an institution eligible or not", () => {
    const base = { institution_type: "public_college", dli_number: null, pgwp_source_url: null }
    expect(institutionInput.safeParse({ ...base, pgwp_eligible: "unknown" }).success).toBe(true)
    expect(institutionInput.safeParse({ ...base, pgwp_eligible: "yes" }).success).toBe(false)
  })

  it("drops AI suggestions that weren't offered, and repeats", () => {
    const s = (occupation_id: string) => ({ occupation_id, rationale: "r" })
    expect(validSuggestions([s("a"), s("invented"), s("a"), s("b")], new Set(["a", "b"]))).toEqual([s("a"), s("b")])
  })
})
