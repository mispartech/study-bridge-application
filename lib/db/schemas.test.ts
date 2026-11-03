import { describe, expect, expectTypeOf, it } from "vitest"
import type { z } from "zod"

import type { Database } from "./database.types"
import { rowSchemas, studentProfileInsert, type TableName } from "./schemas"

type Tables = Database["public"]["Tables"]

describe("schemas match the generated database types", () => {
  it("covers every table", () => {
    const tables: Record<TableName, true> = {
      student_profile: true,
      shortlist: true,
      application_tracker: true,
      university: true,
      programme: true,
      requirement: true,
      intake: true,
      fee: true,
      city_cost: true,
      scholarship: true,
      visa_rule: true,
      grade_mapping: true,
      fx_rate: true,
      source_audit: true,
      review_queue: true,
      ai_usage: true,
      subscription: true,
      advisor_daily_usage: true,
      explanation_cache: true,
    }
    expect(Object.keys(rowSchemas).sort()).toEqual(Object.keys(tables).sort())
  })

  it("parses to a type assignable to each generated Row (compile-time)", () => {
    // A column added, removed or retyped in the DB breaks these lines after `npm run db:types`.
    type Parsed<T extends TableName> = z.infer<(typeof rowSchemas)[T]>
    expectTypeOf<Parsed<"student_profile">>().toExtend<Tables["student_profile"]["Row"]>()
    expectTypeOf<Parsed<"shortlist">>().toExtend<Tables["shortlist"]["Row"]>()
    expectTypeOf<Parsed<"application_tracker">>().toExtend<Tables["application_tracker"]["Row"]>()
    expectTypeOf<Parsed<"university">>().toExtend<Tables["university"]["Row"]>()
    expectTypeOf<Parsed<"programme">>().toExtend<Tables["programme"]["Row"]>()
    expectTypeOf<Parsed<"requirement">>().toExtend<Tables["requirement"]["Row"]>()
    expectTypeOf<Parsed<"intake">>().toExtend<Tables["intake"]["Row"]>()
    expectTypeOf<Parsed<"fee">>().toExtend<Tables["fee"]["Row"]>()
    expectTypeOf<Parsed<"city_cost">>().toExtend<Tables["city_cost"]["Row"]>()
    expectTypeOf<Parsed<"scholarship">>().toExtend<Tables["scholarship"]["Row"]>()
    expectTypeOf<Parsed<"visa_rule">>().toExtend<Tables["visa_rule"]["Row"]>()
    expectTypeOf<Parsed<"grade_mapping">>().toExtend<Tables["grade_mapping"]["Row"]>()
    expectTypeOf<Parsed<"fx_rate">>().toExtend<Tables["fx_rate"]["Row"]>()
    expectTypeOf<Parsed<"source_audit">>().toExtend<Tables["source_audit"]["Row"]>()
    expectTypeOf<Parsed<"review_queue">>().toExtend<Tables["review_queue"]["Row"]>()
    expectTypeOf<Parsed<"ai_usage">>().toExtend<Tables["ai_usage"]["Row"]>()
    expectTypeOf<Parsed<"subscription">>().toExtend<Tables["subscription"]["Row"]>()
    expectTypeOf<Parsed<"advisor_daily_usage">>().toExtend<Tables["advisor_daily_usage"]["Row"]>()
    expectTypeOf<Parsed<"explanation_cache">>().toExtend<Tables["explanation_cache"]["Row"]>()
  })
})

describe("studentProfileInsert", () => {
  it("rejects server-owned and out-of-range fields", () => {
    expect(studentProfileInsert.safeParse({ cgpa: 4.2, cgpa_scale: 5 }).success).toBe(true)
    expect(studentProfileInsert.safeParse({ cgpa: 4.2 }).success).toBe(false)
    expect(studentProfileInsert.safeParse({ cgpa: 4.5, cgpa_scale: 4 }).success).toBe(false)
    expect(studentProfileInsert.safeParse({ ielts: 9.5 }).success).toBe(false)
    expect(studentProfileInsert.safeParse({ budget_total_minor: 1.5 }).success).toBe(false)
    // user_id is set by the server from the session, never accepted from the client.
    expect(studentProfileInsert.parse({ user_id: "00000000-0000-0000-0000-000000000000" })).not.toHaveProperty(
      "user_id"
    )
  })
})
