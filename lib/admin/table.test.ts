import { describe, expect, it } from "vitest"

import { paginate, parseTableState, sortHref, sortRows, tableHref } from "./table"

const opts = { sortable: ["email", "created"], hideable: ["created", "plan"] }

describe("table state from the URL", () => {
  it("defaults to the given sort, page 1 and every column", () => {
    const s = parseTableState({}, { ...opts, defaultSort: "created" })
    expect(s).toMatchObject({ sort: "created", dir: "desc", page: 1 })
    expect([...s.hidden]).toEqual([])
  })

  it("ignores sorts on columns that can't be sorted, and bad pages", () => {
    const s = parseTableState({ sort: "password", dir: "sideways", page: "-3" }, opts)
    expect(s).toMatchObject({ sort: null, dir: "desc", page: 1 })
  })

  it("hides the columns left unticked, once the column form was sent", () => {
    expect([...parseTableState({ show: "plan", cols: "1" }, opts).hidden]).toEqual(["created"])
    expect([...parseTableState({ cols: "1" }, opts).hidden]).toEqual(["created", "plan"])
    // Without the form marker, a stray show= hides nothing.
    expect([...parseTableState({ show: "plan" }, opts).hidden]).toEqual([])
  })

  it("keeps two tables on one page apart with prefixes", () => {
    const params = { "a.sort": "email", "a.dir": "asc", "b.page": "3" }
    expect(parseTableState(params, { ...opts, prefix: "a." })).toMatchObject({ sort: "email", dir: "asc", page: 1 })
    expect(parseTableState(params, { ...opts, prefix: "b." })).toMatchObject({ sort: null, page: 3 })
  })
})

describe("sorting", () => {
  const rows = [
    { n: "b", v: 2 },
    { n: "c", v: null },
    { n: "a", v: 10 },
    { n: "d", v: 2 },
  ]

  it("sorts numbers as numbers, both ways, with empty values last", () => {
    expect(sortRows(rows, (r) => r.v, "asc").map((r) => r.n)).toEqual(["b", "d", "a", "c"])
    expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.n)).toEqual(["a", "b", "d", "c"])
  })

  it("sorts text naturally and case-blind", () => {
    const names = [{ s: "Item 10" }, { s: "item 2" }, { s: "Item 1" }]
    expect(sortRows(names, (r) => r.s, "asc").map((r) => r.s)).toEqual(["Item 1", "item 2", "Item 10"])
  })

  it("keeps the original order without a sort", () => {
    expect(sortRows(rows, undefined, "asc")).toEqual(rows)
  })
})

describe("pages", () => {
  const rows = Array.from({ length: 120 }, (_, i) => i)

  it("returns one page with its position", () => {
    expect(paginate(rows, 2, 50)).toMatchObject({ page: 2, pages: 3, total: 120, from: 51, to: 100 })
    expect(paginate(rows, 3, 50).rows).toHaveLength(20)
  })

  it("shows the last page for a page past the end, and handles no rows", () => {
    expect(paginate(rows, 9, 50).page).toBe(3)
    expect(paginate([], 1, 50)).toMatchObject({ page: 1, pages: 1, total: 0, from: 0, to: 0 })
  })
})

describe("links", () => {
  it("keeps other filters and drops the ones being changed", () => {
    expect(tableHref("/admin/users", { q: "ada", page: "2" }, { page: null })).toBe("/admin/users?q=ada")
    expect(tableHref("/admin/users", {}, {})).toBe("/admin/users")
    expect(tableHref("/admin/x", { show: ["a", "b"] }, { sort: "a" })).toBe("/admin/x?show=a&show=b&sort=a")
  })

  it("sorts ascending first, flips on a second click, and returns to page 1", () => {
    const state = parseTableState({ sort: "email", dir: "asc", page: "4" }, opts)
    expect(sortHref("/admin/users", { sort: "email", dir: "asc", page: "4" }, state, "email")).toBe(
      "/admin/users?sort=email&dir=desc"
    )
    expect(sortHref("/admin/users", {}, state, "created")).toBe("/admin/users?sort=created&dir=asc")
  })
})
