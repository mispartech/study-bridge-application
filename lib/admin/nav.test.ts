import { describe, expect, it } from "vitest"

import { activeHref, environmentLabel, homeFor, NAV, navFor } from "./nav"

const as = (role?: string) => ({ app_metadata: role ? { role } : {} })
const labels = (role?: string) =>
  Object.fromEntries(navFor(as(role)).map((g) => [g.label, g.items.map((i) => i.label)]))

describe("admin navigation per role", () => {
  it("gives admins every group, with the Overview as their home", () => {
    expect(labels("admin")).toEqual({
      Monitor: ["Overview", "Alerts"],
      Students: ["Users", "Emailed reports", "Suggestions and feedback"],
      "Content and data": ["Review queue", "Error reports", "Visa rules", "Exchange rates", "Flights and health"],
      Money: ["Payments"],
      AI: ["AI usage", "Advisor monitor"],
      System: ["Settings", "Pathways", "Audit log", "System", "Diagnostics"],
    })
    expect(navFor(as("admin"))[0]!.items[0]).toMatchObject({ href: "/admin", label: "Overview" })
  })

  it("gives support their desk, the overview and the student pages, and nothing else", () => {
    expect(labels("support")).toEqual({
      Monitor: ["Home", "Overview", "Alerts"],
      Students: ["Users", "Emailed reports", "Suggestions and feedback"],
    })
  })

  it("gives data editors their desk and the content pages only", () => {
    expect(labels("data_editor")).toEqual({
      Monitor: ["Home"],
      "Content and data": ["Review queue", "Error reports", "Visa rules", "Exchange rates", "Flights and health"],
    })
  })

  it("gives students and unknown roles nothing", () => {
    expect(navFor(as())).toEqual([])
    expect(navFor(as("superuser"))).toEqual([])
    expect(navFor(null)).toEqual([])
  })

  it("sends each role to its own home", () => {
    expect(homeFor("admin")).toBe("overview")
    expect(homeFor("support")).toBe("support")
    expect(homeFor("data_editor")).toBe("content")
  })

  it("lists each page once", () => {
    const hrefs = NAV.flatMap((g) => g.items.map((i) => i.href))
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})

describe("current page in the sidebar", () => {
  const hrefs = ["/admin", "/admin/users", "/admin/review", "/admin/overview"]

  it("matches the page itself and the pages under it", () => {
    expect(activeHref("/admin/users", hrefs)).toBe("/admin/users")
    expect(activeHref("/admin/users/0f9a", hrefs)).toBe("/admin/users")
    expect(activeHref("/admin/review/abc", hrefs)).toBe("/admin/review")
  })

  it("marks Home only on the home page, not on every admin page", () => {
    expect(activeHref("/admin", hrefs)).toBe("/admin")
    expect(activeHref("/admin/payments", hrefs)).toBeNull()
  })

  it("doesn't confuse pages that share a prefix", () => {
    expect(activeHref("/admin/users-export", hrefs)).toBeNull()
  })
})

describe("environment badge", () => {
  it("names production, previews and local runs", () => {
    expect(environmentLabel("production")).toBe("Production")
    expect(environmentLabel("preview")).toBe("Preview")
    expect(environmentLabel("development")).toBe("Local")
    expect(environmentLabel(undefined)).toBe("Local")
  })
})
