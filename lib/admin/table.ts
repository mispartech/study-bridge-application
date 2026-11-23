/**
 * Table state kept in the URL (sort, direction, page, visible columns), so a view can be shared, bookmarked
 * and works without JavaScript. Several tables on one page use different prefixes.
 */

export type SearchParams = Record<string, string | string[] | undefined>
export type SortValue = string | number | null | undefined

export type TableState = {
  sort: string | null
  dir: "asc" | "desc"
  page: number
  /** Column keys the viewer hid. */
  hidden: ReadonlySet<string>
}

export const PAGE_SIZE = 50

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const all = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v])

export const paramNames = (prefix = "") => ({
  sort: `${prefix}sort`,
  dir: `${prefix}dir`,
  page: `${prefix}page`,
  show: `${prefix}show`,
  cols: `${prefix}cols`,
})

/**
 * Reads the table's state. `sortable` lists the keys that may be sorted on; anything else in the URL is
 * ignored. Columns are hidden only when the column form was sent (`cols=1`), and then every hideable column
 * that wasn't ticked is hidden.
 */
export function parseTableState(
  params: SearchParams,
  {
    prefix = "",
    sortable,
    hideable,
    defaultSort = null,
    defaultDir = "desc",
  }: {
    prefix?: string
    sortable: readonly string[]
    hideable: readonly string[]
    defaultSort?: string | null
    defaultDir?: "asc" | "desc"
  }
): TableState {
  const n = paramNames(prefix)
  const sort = first(params[n.sort])
  const dir = first(params[n.dir])
  const page = Number.parseInt(first(params[n.page]) ?? "", 10)
  const shown = new Set(all(params[n.show]))
  const hidden = first(params[n.cols]) === "1" ? new Set(hideable.filter((k) => !shown.has(k))) : new Set<string>()
  return {
    sort: sort && sortable.includes(sort) ? sort : defaultSort,
    dir: dir === "asc" || dir === "desc" ? dir : defaultDir,
    page: Number.isFinite(page) && page > 1 ? page : 1,
    hidden,
  }
}

/** A stable sort. Empty values always go last, in either direction. */
export function sortRows<T>(rows: readonly T[], value: ((row: T) => SortValue) | undefined, dir: "asc" | "desc"): T[] {
  if (!value) return [...rows]
  const sign = dir === "asc" ? 1 : -1
  return rows
    .map((row, i) => ({ row, i, v: value(row) }))
    .sort((a, b) => {
      const aEmpty = a.v === null || a.v === undefined || a.v === ""
      const bEmpty = b.v === null || b.v === undefined || b.v === ""
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? a.i - b.i : aEmpty ? 1 : -1
      const cmp =
        typeof a.v === "number" && typeof b.v === "number"
          ? a.v - b.v
          : String(a.v).localeCompare(String(b.v), "en-GB", { numeric: true, sensitivity: "base" })
      return cmp === 0 ? a.i - b.i : cmp * sign
    })
    .map((x) => x.row)
}

export type Page<T> = { rows: T[]; page: number; pages: number; total: number; from: number; to: number }

/** One page of rows; a page past the end shows the last page. */
export function paginate<T>(rows: readonly T[], page: number, size = PAGE_SIZE): Page<T> {
  const total = rows.length
  const pages = Math.max(1, Math.ceil(total / size))
  const current = Math.min(Math.max(1, page), pages)
  const start = (current - 1) * size
  const slice = rows.slice(start, start + size)
  return { rows: slice, page: current, pages, total, from: total ? start + 1 : 0, to: start + slice.length }
}

/** `path` with the current params, changed: `null` removes a param. Array params are kept as repeats. */
export function tableHref(path: string, params: SearchParams, changes: Record<string, string | null>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key in changes) continue
    for (const v of all(value)) query.append(key, v)
  }
  for (const [key, value] of Object.entries(changes)) if (value !== null) query.set(key, value)
  const qs = query.toString()
  return qs ? `${path}?${qs}` : path
}

/** The link a column header points to: sort by it, or flip the direction if it is already the sort. */
export function sortHref(path: string, params: SearchParams, state: TableState, key: string, prefix = ""): string {
  const n = paramNames(prefix)
  const dir = state.sort === key && state.dir === "asc" ? "desc" : "asc"
  return tableHref(path, params, { [n.sort]: key, [n.dir]: dir, [n.page]: null })
}
