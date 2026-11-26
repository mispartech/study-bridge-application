import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

import { describe, expect, it } from "vitest"

import { NAV } from "./nav"

// Guards for docs/ADMIN_REVAMP_PLAN.md, rules for every phase: each admin page and admin API checks its own
// permission on the server (hiding a link is never the check), and admin code stays out of student pages.

const ROOT = process.cwd()

function files(dir: string, match: (name: string) => boolean): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(join(ROOT, path)).isDirectory()) return files(path, match)
    return match(name) ? [path.split(sep).join("/")] : []
  })
}

const read = (path: string) => readFileSync(join(ROOT, path), "utf8")
/** app/admin/users/[id]/page.tsx → /admin/users/[id] */
const routeOf = (page: string) => `/${relative("app", page).split(sep).join("/")}`.replace(/\/page\.tsx$/, "")

/** The role-based home may be opened by any staff role; it decides per role what to show. */
const ANY_STAFF = new Set(["/admin"])

const pages = files("app/admin", (n) => n === "page.tsx")
const apis = files("app/api/admin", (n) => n === "route.ts")
const navPermission = new Map(NAV.flatMap((g) => g.items.map((i) => [i.href, i.permission] as const)))

describe("every admin page checks its permission on the server", () => {
  it("finds the admin pages", () => {
    expect(pages.length).toBeGreaterThanOrEqual(19)
  })

  it.each(pages)("%s", (page) => {
    const source = read(page)
    const route = routeOf(page)
    const permissions = [...source.matchAll(/requireStaff\(\s*"([a-z.]+)"\s*\)/g)].map((m) => m[1])
    if (ANY_STAFF.has(route)) {
      expect(source).toMatch(/requireStaff\(\s*\)/)
      return
    }
    expect(permissions.length, `${page} must call requireStaff("<permission>")`).toBeGreaterThan(0)
    // The page asks for the same permission the sidebar uses to show it.
    const listed = navPermission.get(route)
    if (listed) expect(new Set(permissions)).toEqual(new Set([listed]))
  })

  it("lists every page in the sidebar, apart from detail pages", () => {
    const routes = pages.map(routeOf).filter((r) => !r.includes("["))
    expect(routes.filter((r) => !navPermission.has(r))).toEqual([])
    expect([...navPermission.keys()].filter((href) => !routes.includes(href))).toEqual([])
  })
})

describe("every admin API checks its permission on the server", () => {
  it("finds the admin APIs", () => {
    expect(apis.length).toBeGreaterThanOrEqual(10)
  })

  it.each(apis)("%s", (api) => {
    const handlers = read(api)
      .split(/export async function (?=GET|POST|PUT|PATCH|DELETE)/)
      .slice(1)
    expect(handlers.length, `${api} exports no handlers this test can see`).toBeGreaterThan(0)
    for (const handler of handlers) {
      expect(handler, `${api}: ${handler.slice(0, 12)} must call staffFromRequest`).toMatch(/staffFromRequest\(/)
    }
  })
})

describe("admin code stays out of student pages", () => {
  const student = [
    ...files("app", (n) => /\.(ts|tsx)$/.test(n)).filter(
      (f) => !f.startsWith("app/admin/") && !f.startsWith("app/api/")
    ),
    ...files("components", (n) => /\.(ts|tsx)$/.test(n)).filter((f) => !f.startsWith("components/admin/")),
  ]

  it.each(student)("%s", (file) => {
    expect(read(file)).not.toMatch(/from\s+["']@\/(components|lib)\/admin\//)
  })
})
