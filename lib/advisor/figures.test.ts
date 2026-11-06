// @vitest-environment node
import { describe, expect, it } from "vitest"

import { uncheckedFigures } from "./figures"

describe("uncheckedFigures", () => {
  it("passes money that differs only in formatting or rounding", () => {
    const tools = ['{"total":"₦47.2m","local":"CA$41.2k","fee":"£34.8k","rule":"£1,171 a month"}']
    for (const answer of [
      "That's ₦47.2m.",
      "That's NGN 47.2 million.",
      "That's CA$41,200.",
      "CAD 41.2k",
      "CAD $41,200",
      "The fee is £34,800.",
      "About £1.2k a month.",
    ]) {
      expect(uncheckedFigures(answer, tools), answer).toEqual([])
    }
  })

  it("names money that nothing supports", () => {
    expect(uncheckedFigures("You need £9,000.", ['{"fee":"£34.8k"}'])).toEqual(["£9,000"])
    expect(uncheckedFigures("That's ₦800m.", ['{"total":"₦80m"}'])).toEqual(["₦800m"])
  })

  it("doesn't let a figure cross currencies", () => {
    expect(uncheckedFigures("That's £60.2m.", ['{"total":"₦60.2m"}'])).toEqual(["£60.2m"])
    expect(uncheckedFigures("That's CA$41.2k.", ['{"total":"US$41.2k"}'])).toEqual(["CA$41.2k"])
  })

  it("accepts what the student typed", () => {
    expect(uncheckedFigures("₦40m may not be enough.", ["Will ₦40m be enough?"])).toEqual([])
  })

  it("matches dates in any common form", () => {
    const tools = ['{"deadline":"2027-01-31","rule":"effective 30 November 2026"}']
    for (const answer of [
      "31 January 2027",
      "January 31, 2027",
      "Jan 31st, 2027",
      "31 Jan",
      "January 2027",
      "Nov 30",
    ]) {
      expect(uncheckedFigures(`Apply by ${answer}.`, tools), answer).toEqual([])
    }
  })

  it("names a date that nothing supports", () => {
    expect(uncheckedFigures("Apply by 15 March 2027.", ['{"deadline":"2027-01-31"}'])).toEqual(["15 mar 2027"])
    expect(uncheckedFigures("Apply by 31 January 2028.", ['{"deadline":"2027-01-31"}'])).toEqual(["31 jan 2028"])
  })

  it("isn't fooled by ordinary words or years", () => {
    expect(uncheckedFigures("You may apply in 2027 for 2 years.", ["{}"])).toEqual([])
  })

  it("checks percentages", () => {
    expect(uncheckedFigures("It covers 50% of tuition.", ['{"coverage":"50% of tuition"}'])).toEqual([])
    expect(uncheckedFigures("It covers 75 percent.", ['{"coverage":"50%"}'])).toEqual(["75 percent"])
  })
})
