// @vitest-environment node
import { describe, expect, it } from "vitest"

import { inCountries, isSelected, MAX_COUNTRIES, pickCountry } from "./countries"

describe("country selection", () => {
  it("turns a card on when tapped, and off when tapped again", () => {
    expect(pickCountry([], "UK", MAX_COUNTRIES)).toEqual({ next: ["UK"], refused: false })
    expect(pickCountry(["UK"], "UK", MAX_COUNTRIES)).toEqual({ next: [], refused: false })
  })

  it("allows two countries and refuses a third, keeping the two already chosen", () => {
    expect(pickCountry(["UK"], "CA", MAX_COUNTRIES)).toEqual({ next: ["UK", "CA"], refused: false })
    expect(pickCountry(["UK", "CA"], "US", MAX_COUNTRIES)).toEqual({ next: ["UK", "CA"], refused: true })
  })

  it("has no limit when none is given (the results filter)", () => {
    expect(pickCountry(["UK", "CA"], "US").next).toEqual(["UK", "CA", "US"])
  })

  it("filters results by country, with no choice meaning every country", () => {
    const items = [{ country: "UK" }, { country: "CA" }]
    expect(inCountries(items, ["CA"])).toEqual([{ country: "CA" }])
    expect(inCountries(items, [])).toEqual(items)
    expect(isSelected([], "US")).toBe(true)
  })
})
