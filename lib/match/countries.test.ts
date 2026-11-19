// @vitest-environment node
import { describe, expect, it } from "vitest"

import { inCountries, isSelected, toggleCountry } from "./countries"

describe("country selection", () => {
  it("treats no selection as every country", () => {
    expect(isSelected([], "US")).toBe(true)
    expect(isSelected(["UK"], "US")).toBe(false)
  })

  it("narrows from every country when one is turned off", () => {
    expect(toggleCountry([], "US")).toEqual(["UK", "CA"])
  })

  it("adds and removes a country", () => {
    expect(toggleCountry(["UK"], "CA")).toEqual(["UK", "CA"])
    expect(toggleCountry(["UK", "CA"], "CA")).toEqual(["UK"])
  })

  it("goes back to every country rather than to none", () => {
    expect(toggleCountry(["UK"], "UK")).toEqual([])
    expect(toggleCountry(["UK", "CA"], "US")).toEqual([])
  })

  it("filters results by country", () => {
    const items = [{ country: "UK" }, { country: "CA" }]
    expect(inCountries(items, ["CA"])).toEqual([{ country: "CA" }])
    expect(inCountries(items, [])).toEqual(items)
  })
})
