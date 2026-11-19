import { describe, expect, it } from "vitest"

import { academicCheck } from "./filters"
import type { Academics } from "./types"

type Requirement = Parameters<typeof academicCheck>[0]
const requirement = (over: Partial<Requirement>) =>
  ({
    min_uk_class: null,
    min_gpa4: 3,
    nigeria_rule: null,
    considers_lower_with_experience: false,
    ...over,
  }) as Requirement
const profile = { nationality: "NG", cgpa: null, cgpa_scale: null, hnd_pgd: false, work_years: 0 }
const academics = (gpa4: number | null): Academics => ({ band: "upper_second", gpa4, percent: null, source: "stated" })

describe("a programme that states only a GPA minimum (Canada)", () => {
  it("passes a student at or above the GPA", () => {
    expect(academicCheck(requirement({}), profile, academics(3.2)).passes).toBe(true)
  })

  it("excludes a student below it, with no reach", () => {
    expect(academicCheck(requirement({}), profile, academics(2.7))).toMatchObject({ passes: false, reach: false })
  })

  it("excludes a student whose GPA isn't known rather than guessing", () => {
    expect(academicCheck(requirement({}), profile, academics(null)).passes).toBe(false)
  })

  it("still uses the degree class when a UK programme states one", () => {
    expect(academicCheck(requirement({ min_uk_class: "first", min_gpa4: null }), profile, academics(3.9)).passes).toBe(
      false
    )
  })
})
