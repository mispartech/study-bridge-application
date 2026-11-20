import { describe, expect, it } from "vitest"

import { can, isStaff, roleOf } from "./roles"

const as = (role: unknown) => ({ app_metadata: { role } })

describe("staff roles", () => {
  it("only trusts app_metadata, never what a student can edit", () => {
    expect(roleOf({ app_metadata: {}, user_metadata: { role: "admin" } })).toBeNull()
    expect(roleOf(as("superuser"))).toBeNull()
    expect(isStaff(null)).toBe(false)
  })

  it("gives students nothing in the console", () => {
    for (const p of ["users.read", "content", "roles", "settings", "ai", "payments"] as const) {
      expect(can(as(undefined), p)).toBe(false)
    }
  })

  it("lets support read users but not change roles or content", () => {
    expect(can(as("support"), "users.read")).toBe(true)
    expect(can(as("support"), "roles")).toBe(false)
    expect(can(as("support"), "content")).toBe(false)
  })

  it("lets data editors edit content but not see users", () => {
    expect(can(as("data_editor"), "content")).toBe(true)
    expect(can(as("data_editor"), "users.read")).toBe(false)
    expect(can(as("data_editor"), "settings")).toBe(false)
  })

  it("lets admins do everything", () => {
    for (const p of ["users.read", "users.manage", "content", "roles", "settings", "ai", "payments"] as const) {
      expect(can(as("admin"), p)).toBe(true)
    }
  })
})
