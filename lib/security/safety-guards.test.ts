import { describe, expect, it } from "vitest"

import { assertNotProduction, PRODUCTION_SUPABASE_REFS } from "@/tests/guard/supabase-guard.mjs"

import { withoutInternal } from "../admin/internal"
import { roleAlertText } from "./role-alert"

describe("test runner guard", () => {
  const prod = `https://${PRODUCTION_SUPABASE_REFS[0]}.supabase.co`

  it("refuses the production project, by URL or database connection", () => {
    expect(() => assertNotProduction({ NEXT_PUBLIC_SUPABASE_URL: prod })).toThrow(/PRODUCTION/)
    expect(() =>
      assertNotProduction({
        NEXT_PUBLIC_SUPABASE_URL: "https://devproject.supabase.co",
        SUPABASE_DB_URL: `postgresql://postgres.${PRODUCTION_SUPABASE_REFS[0]}@host/db`,
      })
    ).toThrow(/SUPABASE_DB_URL/)
  })

  it("refuses when nothing is set, and allows a development project", () => {
    expect(() => assertNotProduction({})).toThrow(/not set/)
    expect(() => assertNotProduction({ NEXT_PUBLIC_SUPABASE_URL: "https://devproject.supabase.co" })).not.toThrow()
  })

  it("never puts the setting's value in the message", () => {
    try {
      assertNotProduction({ NEXT_PUBLIC_SUPABASE_URL: prod })
    } catch (err) {
      expect((err as Error).message).not.toContain(prod)
    }
  })
})

describe("internal accounts in metrics", () => {
  it("drops internal users' rows but keeps visitors and system rows", () => {
    const rows = [{ user_id: "staff" }, { user_id: "student" }, { user_id: null }]
    expect(withoutInternal(rows, new Set(["staff"]), (r) => r.user_id)).toEqual([
      { user_id: "student" },
      { user_id: null },
    ])
  })
})

describe("role change alert", () => {
  it("says granted for a new staff role, changed otherwise, and how to undo it", () => {
    const at = new Date("2026-11-22T10:15:00Z")
    const granted = roleAlertText({ targetEmail: "a@b.com", before: "student", after: "admin", by: "x@y.com", at })
    expect(granted.subject).toBe("Security alert: staff role granted for a@b.com")
    expect(granted.text).toContain("Role: student -> admin")
    expect(granted.text).toContain("Changed by: x@y.com")
    expect(granted.text).toContain("2026-11-22 10:15 UTC")
    expect(granted.text).toContain("set the role back to Student")
    const changed = roleAlertText({ targetEmail: "a@b.com", before: "support", after: "admin", by: "system", at })
    expect(changed.subject).toContain("changed")
  })
})
