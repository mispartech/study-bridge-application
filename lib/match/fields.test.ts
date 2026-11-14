import { describe, expect, it } from "vitest"

import { Constants } from "@/lib/db/database.types"

import { FIELDS } from "./labels"
import { FIELD_CODES, matchProfile } from "./types"

describe("course list", () => {
  it("is the same in the form, the match API and the database", () => {
    const form = FIELDS.map((f) => f.value).sort()
    expect([...FIELD_CODES].sort()).toEqual(form)
    expect([...Constants.public.Enums.field_code].sort()).toEqual(form)
  })

  it("accepts nursing and mental health profiles", () => {
    for (const field of ["nursing", "mental_health"]) {
      expect(matchProfile.safeParse({ nationality: "NG", target_cycle: "2027/28", field }).success).toBe(true)
    }
  })
})
