import { describe, expect, it } from "vitest"

import demo from "@/tests/fixtures/demo-catalogue.json"

import { locationsFor } from "./locations"
import type { Catalogue } from "./types"

const catalogue = demo as unknown as Catalogue

describe("places for the city picker", () => {
  it("lists only regions and cities of universities that teach a listed programme", () => {
    const teaching = new Set(catalogue.programmes.map((p) => p.university_id))
    const locations = locationsFor(catalogue, ["UK", "CA"])
    for (const country of ["UK", "CA"] as const) {
      const expected = catalogue.universities.filter((u) => u.country === country && teaching.has(u.id))
      const listed = (locations[country] ?? []).flatMap((r) => r.cities.map((c) => `${r.region}|${c}`))
      expect(new Set(listed)).toEqual(new Set(expected.map((u) => `${u.region}|${u.city}`)))
    }
  })

  it("leaves out countries nobody asked for, and sorts A to Z", () => {
    const locations = locationsFor(catalogue, ["UK"])
    expect(Object.keys(locations)).toEqual(["UK"])
    const regions = (locations.UK ?? []).map((r) => r.region)
    expect(regions).toEqual([...regions].sort((a, b) => a.localeCompare(b, "en")))
  })
})
