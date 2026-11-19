import { describe, expect, it } from "vitest"

import { toCsv } from "./csv"
import { funnel } from "./funnel"
import { lagosMidnight, parseRange } from "./range"

describe("CSV export", () => {
  it("quotes commas and quotes, and neutralises spreadsheet formulas", () => {
    const csv = toCsv([{ a: 'He said "hi", ok', b: '=HYPERLINK("x")', c: null }], ["a", "b", "c"])
    expect(csv).toBe('a,b,c\r\n"He said ""hi"", ok","\'=HYPERLINK(""x"")",\r\n')
  })
})

describe("date ranges", () => {
  const now = new Date("2026-11-21T10:00:00Z")
  it("starts days at midnight Lagos time", () => {
    expect(lagosMidnight(now).toISOString()).toBe("2026-11-20T23:00:00.000Z")
  })
  it("reads presets and custom dates, falling back to 30 days", () => {
    expect(parseRange({ range: "7d" }, now).from.toISOString()).toBe("2026-11-14T23:00:00.000Z")
    expect(parseRange({ from: "2026-11-01", to: "2026-11-02" }, now).to.toISOString()).toBe("2026-11-02T23:00:00.000Z")
    expect(parseRange({ range: "nonsense" }, now).label).toBe("Last 30 days")
    expect(parseRange({ from: "2026-11-05", to: "2026-11-01" }, now).label).toBe("Last 30 days")
  })
})

describe("funnel", () => {
  it("counts people per step and the share who reached it from the step before", () => {
    const steps = funnel([
      { event: "quick_match_run", events: 50, actors: 40 },
      { event: "wizard_completed", events: 12, actors: 10 },
      { event: "results_viewed", events: 30, actors: 20 },
      { event: "report_emailed", events: 3, actors: 3 },
      { event: "account_created", events: 2, actors: 2 },
    ])
    expect(steps.map((s) => s.people)).toEqual([40, 10, 20, 5, 0, 0, 0])
    expect(steps[1]!.fromPrevious).toBe(0.25)
    expect(steps[3]!.fromPrevious).toBe(0.25)
    expect(steps[0]!.fromPrevious).toBeNull()
    expect(steps[5]!.fromPrevious).toBeNull()
  })
})
